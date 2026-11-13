import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "@/lib/rules/rule-set";
import { kstDateTime } from "@/lib/time";
import { AppError } from "@/server/errors";
import { getAvailableCount } from "@/server/passes/availability-service";
import {
  createPass,
  refundPass,
  updatePass,
  type PassInput,
} from "@/server/passes/pass-service";
import {
  effectiveRules,
  getTrainerDefaultRuleSet,
  respondRuleConsent,
  updateTrainerDefaultRules,
} from "@/server/rules/rule-service";
import { resetDb, seedTerms, testDb } from "@/test/db-helpers";
import { T0, makeUser, resetFactorySeq } from "@/test/factories";
import { getStudentDetailForTrainer } from "./detail-service";
import {
  findMergeCandidates,
  listTrainerStudents,
  mergeTemporaryStudent,
  registerTemporaryStudent,
  requestLinkToStudent,
  respondLinkRequest,
  searchRegisteredStudents,
} from "./student-service";

const db = testDb();

async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy(
    (e: unknown) => e instanceof AppError && e.code === code,
  );
}

const basePass: PassInput = {
  name: "PT 20회",
  count: 20,
  startDate: "2026-11-01",
  endDate: "2027-01-31",
};

async function trainerWithStudent() {
  const trainer = await makeUser("TRAINER");
  const temp = await registerTemporaryStudent(
    db,
    trainer.userId,
    { name: "임시학생", phone: "01077770000" },
    T0,
  );
  return { trainer, studentId: temp.id };
}

async function addBooking(
  studentId: string,
  trainerId: string,
  start: Date,
  status:
    | "CONFIRMED"
    | "PENDING_CONFIRM"
    | "REQUESTED"
    | "PENDING_APPROVAL"
    | "COMPLETED"
    | "CANCELED"
    | "NO_SHOW",
  deducted = false,
  passId: string | null = null,
) {
  return db.booking.create({
    data: {
      studentId,
      trainerId,
      startAt: start,
      endAt: new Date(start.getTime() + 50 * 60_000),
      source: "TRAINER",
      status,
      deducted,
      deductReason: deducted
        ? status === "NO_SHOW"
          ? "NO_SHOW"
          : "COMPLETED"
        : null,
      passId,
    },
  });
}

beforeEach(async () => {
  await resetDb(db);
  await seedTerms(db);
  resetFactorySeq();
});
afterAll(async () => db.$disconnect());

describe("getAvailableCount (서버, DB)", () => {
  it("잔여 − 예정 예약, 여러 이용권, 만료", async () => {
    const { trainer, studentId } = await trainerWithStudent();
    const a = await createPass(
      db,
      trainer.userId,
      studentId,
      { ...basePass, name: "A", count: 3, endDate: "2026-11-30" },
      T0,
    );
    await createPass(
      db,
      trainer.userId,
      studentId,
      {
        ...basePass,
        name: "B",
        count: 10,
        startDate: "2026-11-15",
        endDate: "2027-02-28",
      },
      T0,
    );

    await addBooking(
      studentId,
      trainer.userId,
      kstDateTime(2026, 11, 3, 10),
      "COMPLETED",
      true,
      a.id,
    );
    await addBooking(
      studentId,
      trainer.userId,
      kstDateTime(2026, 11, 20, 10),
      "CONFIRMED",
    );
    await addBooking(
      studentId,
      trainer.userId,
      kstDateTime(2026, 11, 21, 10),
      "PENDING_CONFIRM",
    );
    await addBooking(
      studentId,
      trainer.userId,
      kstDateTime(2026, 11, 22, 10),
      "CANCELED",
    );

    // A 잔여 2 → 11/20, 11/21 배정 → A 0, B 10
    expect(await getAvailableCount(db, studentId, "2026-11-10")).toBe(0);
    expect(await getAvailableCount(db, studentId, "2026-11-25")).toBe(10);
    expect(await getAvailableCount(db, studentId, "2026-12-10")).toBe(10);
    expect(await getAvailableCount(db, studentId, "2027-03-01")).toBe(0);
  });

  it("한국 날짜 경계: 만료일 23:30 KST 수업은 가능", async () => {
    const { trainer, studentId } = await trainerWithStudent();
    await createPass(
      db,
      trainer.userId,
      studentId,
      { ...basePass, count: 1, endDate: "2026-11-30" },
      T0,
    );
    const late = kstDateTime(2026, 11, 30, 23, 30); // UTC로는 11/30 14:30
    await addBooking(studentId, trainer.userId, late, "CONFIRMED");
    expect(await getAvailableCount(db, studentId, "2026-11-30")).toBe(0);
  });

  it("환불하면 그 이용권은 세지 않는다", async () => {
    const { trainer, studentId } = await trainerWithStudent();
    const p = await createPass(db, trainer.userId, studentId, basePass, T0);
    expect(await getAvailableCount(db, studentId, "2026-11-20")).toBe(20);
    await refundPass(db, trainer.userId, p.id, T0);
    expect(await getAvailableCount(db, studentId, "2026-11-20")).toBe(0);
  });
});

describe("권한: 트레이너는 자기 수강생만", () => {
  it("다른 트레이너의 수강생은 조회·이용권 등록 불가", async () => {
    const { studentId } = await trainerWithStudent();
    const other = await makeUser("TRAINER");
    await expectAppError(
      getStudentDetailForTrainer(db, other.userId, studentId),
      "NOT_FOUND",
    );
    await expectAppError(
      createPass(db, other.userId, studentId, basePass, T0),
      "NOT_FOUND",
    );
    expect(await listTrainerStudents(db, other.userId)).toHaveLength(0);
  });

  it("다른 트레이너의 이용권은 고칠 수 없다", async () => {
    const { trainer, studentId } = await trainerWithStudent();
    const p = await createPass(db, trainer.userId, studentId, basePass, T0);
    const other = await makeUser("TRAINER");
    await expectAppError(
      updatePass(db, other.userId, p.id, { ...basePass, count: 99 }, T0),
      "NOT_FOUND",
    );
  });
});

describe("수강생 등록과 연결", () => {
  it("트레이너가 가입 수강생에게 연결 요청 → 수강생 수락", async () => {
    const trainer = await makeUser("TRAINER");
    const student = await makeUser("STUDENT", { name: "홍길동" });
    const found = await searchRegisteredStudents(db, trainer.userId, "홍길");
    expect(found).toHaveLength(1);
    expect(found[0].phoneMasked).toMatch(/^010-\*\*\*\*-\d{4}$/);

    const req = await requestLinkToStudent(
      db,
      trainer.userId,
      found[0].studentId,
      T0,
    );
    // 트레이너는 자기 요청을 수락할 수 없다
    await expectAppError(
      respondLinkRequest(
        db,
        { userId: trainer.userId, requestId: req.id, accept: true },
        T0,
      ),
      "NOT_FOUND",
    );
    await respondLinkRequest(
      db,
      { userId: student.userId, requestId: req.id, accept: true },
      T0,
    );

    const list = await listTrainerStudents(db, trainer.userId, {}, T0);
    expect(list.map((s) => s.name)).toEqual(["홍길동"]);
    expect(list[0].status).toBe("EXPIRED"); // 이용권 없음
  });

  it("수강생이 가입 때 보낸 연결 요청을 트레이너가 수락", async () => {
    const trainer = await makeUser("TRAINER");
    const student = await makeUser("STUDENT", {
      trainer: { trainerUserId: trainer.userId },
    });
    const req = await db.linkRequest.findFirstOrThrow({
      where: { fromUserId: student.userId },
    });
    await respondLinkRequest(
      db,
      { userId: trainer.userId, requestId: req.id, accept: true },
      T0,
    );
    const s = await db.student.findUniqueOrThrow({
      where: { userId: student.userId },
    });
    expect(s.currentTrainerId).toBe(trainer.userId);
  });

  it("담당 트레이너가 있으면 다른 트레이너는 연결 요청 불가 (담당 변경은 인계)", async () => {
    const t1 = await makeUser("TRAINER");
    const t2 = await makeUser("TRAINER");
    const student = await makeUser("STUDENT", {
      trainer: { trainerUserId: t1.userId },
    });
    const req = await db.linkRequest.findFirstOrThrow({
      where: { fromUserId: student.userId },
    });
    await respondLinkRequest(
      db,
      { userId: t1.userId, requestId: req.id, accept: true },
      T0,
    );
    const s = await db.student.findUniqueOrThrow({
      where: { userId: student.userId },
    });
    await expectAppError(
      requestLinkToStudent(db, t2.userId, s.id, T0),
      "HAS_TRAINER",
    );
  });

  it("임시 등록: 가입한 번호면 불러오기로 안내", async () => {
    const trainer = await makeUser("TRAINER");
    const student = await makeUser("STUDENT");
    await expectAppError(
      registerTemporaryStudent(
        db,
        trainer.userId,
        { name: "x", phone: student.phone },
        T0,
      ),
      "REGISTERED",
    );
  });

  it("가입 시 같은 전화번호의 임시 등록 기록을 합친다 (이용권 유지)", async () => {
    const trainer = await makeUser("TRAINER");
    const temp = await registerTemporaryStudent(
      db,
      trainer.userId,
      { name: "김미가입", phone: "01055551234" },
      T0,
    );
    await createPass(db, trainer.userId, temp.id, basePass, T0);

    const student = await makeUser("STUDENT", {
      phone: "01055551234",
      name: "김가입",
    });
    const candidates = await findMergeCandidates(db, student.userId);
    expect(candidates).toEqual([
      expect.objectContaining({
        studentId: temp.id,
        trainerName: trainer.name,
        passCount: 1,
      }),
    ]);
    await mergeTemporaryStudent(db, student.userId, temp.id, T0);

    const merged = await db.student.findUniqueOrThrow({
      where: { userId: student.userId },
    });
    expect(merged.id).toBe(temp.id);
    expect(merged.name).toBe("김가입");
    expect(await db.student.count({ where: { phone: "01055551234" } })).toBe(1);
    expect(await getAvailableCount(db, merged.id, "2026-11-20")).toBe(20);
    expect(await findMergeCandidates(db, student.userId)).toHaveLength(0);
  });
});

describe("이용권과 변경 이력", () => {
  it("등록하면 바로 사용 중 + 규칙 동의 요청", async () => {
    const { trainer, studentId } = await trainerWithStudent();
    const p = await createPass(db, trainer.userId, studentId, basePass, T0);
    expect(p.status).toBe("ACTIVE");
    expect(
      await db.ruleConsent.count({
        where: { passId: p.id, status: "PENDING" },
      }),
    ).toBe(1);
    expect(await db.auditLog.count({ where: { action: "pass.create" } })).toBe(
      1,
    );
  });

  it("횟수·만료일을 바꾸면 변경 이력", async () => {
    const { trainer, studentId } = await trainerWithStudent();
    const p = await createPass(db, trainer.userId, studentId, basePass, T0);
    await updatePass(
      db,
      trainer.userId,
      p.id,
      { ...basePass, count: 24, endDate: "2027-02-28" },
      T0,
    );
    const logs = await db.passChangeLog.findMany({
      where: { passId: p.id },
      orderBy: { field: "asc" },
    });
    expect(logs.map((l) => [l.field, l.before, l.after])).toEqual([
      ["count", "20", "24"],
      ["endDate", "2027-01-31", "2027-02-28"],
    ]);
  });

  it("입력 검사", async () => {
    const { trainer, studentId } = await trainerWithStudent();
    await expectAppError(
      createPass(db, trainer.userId, studentId, { ...basePass, count: 0 }, T0),
      "INVALID",
    );
    await expectAppError(
      createPass(
        db,
        trainer.userId,
        studentId,
        { ...basePass, endDate: "2026-10-01" },
        T0,
      ),
      "INVALID",
    );
    await expectAppError(
      createPass(db, trainer.userId, studentId, { ...basePass, name: " " }, T0),
      "INVALID",
    );
  });
});

describe("규칙 버전과 동의", () => {
  it("기본 규칙: 값이 바뀔 때만 새 버전", async () => {
    const t = await makeUser("TRAINER");
    const v1 = await getTrainerDefaultRuleSet(db, t.userId);
    expect(v1.version).toBe(1);
    expect(
      (await updateTrainerDefaultRules(db, t.userId, DEFAULT_RULES, T0))
        .version,
    ).toBe(1);
    expect(
      (
        await updateTrainerDefaultRules(
          db,
          t.userId,
          { ...DEFAULT_RULES, lateCancelHours: 12 },
          T0,
        )
      ).version,
    ).toBe(2);
  });

  it("동의 → 적용, 규칙을 바꾸면 다시 요청하고 동의 전까지 이전 규칙 적용", async () => {
    const trainer = await makeUser("TRAINER");
    const student = await makeUser("STUDENT", {
      trainer: { trainerUserId: trainer.userId },
    });
    const req = await db.linkRequest.findFirstOrThrow({
      where: { fromUserId: student.userId },
    });
    await respondLinkRequest(
      db,
      { userId: trainer.userId, requestId: req.id, accept: true },
      T0,
    );
    const studentId = (
      await db.student.findUniqueOrThrow({ where: { userId: student.userId } })
    ).id;

    const p = await createPass(db, trainer.userId, studentId, basePass, T0);
    expect(effectiveRules(p)).toMatchObject({ agreed: false });
    expect(
      (await listTrainerStudents(db, trainer.userId, {}, T0))[0].ruleUnagreed,
    ).toBe(true);

    const c1 = await db.ruleConsent.findFirstOrThrow({
      where: { passId: p.id },
    });
    await respondRuleConsent(
      db,
      { studentUserId: student.userId, consentId: c1.id, action: "AGREE" },
      T0,
    );
    let pass = await db.pass.findUniqueOrThrow({
      where: { id: p.id },
      include: { ruleSet: true },
    });
    expect(effectiveRules(pass)).toEqual({
      ruleSetId: c1.ruleSetVersionId,
      agreed: true,
      pendingNewRules: false,
    });
    expect(
      (await listTrainerStudents(db, trainer.userId, {}, T0))[0].ruleUnagreed,
    ).toBe(false);

    // 이 수강생만 노쇼 차감 안 함으로 바꿈
    await updatePass(
      db,
      trainer.userId,
      p.id,
      { ...basePass, rules: { ...DEFAULT_RULES, noShowDeduct: false } },
      T0,
    );
    pass = await db.pass.findUniqueOrThrow({
      where: { id: p.id },
      include: { ruleSet: true },
    });
    expect(pass.ruleSet.kind).toBe("PASS");
    expect(pass.ruleSet.noShowDeduct).toBe(false);
    expect(effectiveRules(pass)).toEqual({
      ruleSetId: c1.ruleSetVersionId,
      agreed: true,
      pendingNewRules: true,
    });

    // 이전 요청에는 더 응답할 수 없고 새 요청이 있다
    const c2 = await db.ruleConsent.findFirstOrThrow({
      where: { passId: p.id, status: "PENDING" },
    });
    expect(c2.ruleSetVersionId).toBe(pass.ruleSetVersionId);
    await respondRuleConsent(
      db,
      {
        studentUserId: student.userId,
        consentId: c2.id,
        action: "INQUIRE",
        inquiryText: "왜 바뀌나요?",
      },
      T0,
    );
    expect(
      (await db.ruleConsent.findUniqueOrThrow({ where: { id: c2.id } })).status,
    ).toBe("INQUIRED");

    await respondRuleConsent(
      db,
      { studentUserId: student.userId, consentId: c2.id, action: "AGREE" },
      T0,
    );
    pass = await db.pass.findUniqueOrThrow({
      where: { id: p.id },
      include: { ruleSet: true },
    });
    expect(effectiveRules(pass)).toEqual({
      ruleSetId: pass.ruleSetVersionId,
      agreed: true,
      pendingNewRules: false,
    });
  });

  it("다른 수강생의 동의 요청에는 응답할 수 없다", async () => {
    const { trainer, studentId } = await trainerWithStudent();
    const p = await createPass(db, trainer.userId, studentId, basePass, T0);
    const c = await db.ruleConsent.findFirstOrThrow({
      where: { passId: p.id },
    });
    const stranger = await makeUser("STUDENT");
    await expectAppError(
      respondRuleConsent(
        db,
        { studentUserId: stranger.userId, consentId: c.id, action: "AGREE" },
        T0,
      ),
      "NOT_FOUND",
    );
  });
});
