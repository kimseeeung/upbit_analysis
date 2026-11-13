import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { kstDateTime, toKstDateKey } from "@/lib/time";
import { AppError } from "@/server/errors";
import {
  approveWithPin,
  runApprovalJobs,
} from "@/server/bookings/approval-service";
import {
  createBookingsByTrainer,
  respondConfirmRequest,
} from "@/server/bookings/booking-service";
import { createPass } from "@/server/passes/pass-service";
import { respondRuleConsent } from "@/server/rules/rule-service";
import { respondLinkRequest } from "@/server/students/student-service";
import { resetDb, seedTerms, testDb } from "@/test/db-helpers";
import { T0, makeUser, resetFactorySeq } from "@/test/factories";
import {
  acceptAdminInvite,
  canAdminWithdraw,
  consentMembership,
  createCenterForTrainer,
  createInvite,
  joinWithInvite,
  requestMembership,
  respondMembership,
  startDissolve,
} from "./center-service";
import {
  getCenterCalendar,
  getCenterPayments,
  getCenterStats,
  getCenterStudents,
} from "./center-views";
import {
  chooseDeparture,
  releaseTrainer,
  requestMove,
  runCenterJobs,
  startDeparture,
} from "./departure-service";
import {
  centerApprovePassTransfer,
  decidePassTransfer,
  respondTransferAsNewTrainer,
  respondTransferAsStudent,
  startTransfer,
} from "./transfer-service";

const db = testDb();
const DAY = 86400_000;
async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy(
    (e: unknown) => e instanceof AppError && e.code === code,
  );
}

/** 센터 관리자(관리자 유형) + 센터 + 소속 트레이너 */
async function centerWithTrainers(n: number) {
  const admin = await makeUser("CENTER_ADMIN");
  const center = await db.center.findFirstOrThrow({
    where: { admins: { some: { userId: admin.userId } } },
  });
  const trainers = [];
  for (let i = 0; i < n; i++) {
    const t = await makeUser("TRAINER");
    const { code } = await createInvite(db, admin.userId, "TRAINER", T0);
    await joinWithInvite(db, t.userId, code, true, T0);
    trainers.push(t);
  }
  return { admin, center, trainers };
}

/** 트레이너의 가입 수강생 + 이용권(동의) */
async function studentOf(trainerId: string, priceAt: Date = T0) {
  const st = await makeUser("STUDENT", {
    trainer: { trainerUserId: trainerId },
  });
  const req = await db.linkRequest.findFirstOrThrow({
    where: { fromUserId: st.userId },
  });
  await respondLinkRequest(
    db,
    { userId: trainerId, requestId: req.id, accept: true },
    T0,
  );
  const studentId = (
    await db.student.findUniqueOrThrow({ where: { userId: st.userId } })
  ).id;
  const pass = await createPass(
    db,
    trainerId,
    studentId,
    {
      name: "PT",
      count: 10,
      startDate: "2026-11-01",
      endDate: "2027-03-31",
      price: 500000,
      paidAt: toKstDateKey(priceAt),
    },
    T0,
  );
  const c = await db.ruleConsent.findFirstOrThrow({
    where: { passId: pass.id },
  });
  await respondRuleConsent(
    db,
    { studentUserId: st.userId, consentId: c.id, action: "AGREE" },
    T0,
  );
  return { ...st, studentId, pass };
}

async function book(
  trainerId: string,
  studentId: string,
  start: Date,
  studentUserId: string,
) {
  const r = await createBookingsByTrainer(
    db,
    { trainerId, studentId, start, acknowledgeWarnings: true },
    T0,
  );
  if (r.needsConfirmation) throw new Error();
  await respondConfirmRequest(
    db,
    { userId: studentUserId, bookingId: r.created[0], accept: true },
    T0,
  );
  return r.created[0];
}

beforeEach(async () => {
  await resetDb(db);
  await seedTerms(db);
  resetFactorySeq();
});
afterAll(async () => db.$disconnect());

describe("센터 소속", () => {
  it("요청 → 관리자 승인 → 트레이너 동의로 소속 완료, 한 곳에만", async () => {
    const admin = await makeUser("CENTER_ADMIN");
    const center = await db.center.findFirstOrThrow();
    const t = await makeUser("TRAINER");
    const m = await requestMembership(db, t.userId, center.id, T0);
    await expectAppError(
      consentMembership(db, t.userId, m.id, T0),
      "NOT_FOUND",
    ); // 승인 전
    await respondMembership(db, admin.userId, m.id, true, T0);
    await consentMembership(db, t.userId, m.id, T0);
    expect(
      (await db.centerMembership.findUniqueOrThrow({ where: { id: m.id } }))
        .status,
    ).toBe("ACTIVE");
    const other = await makeUser("CENTER_ADMIN");
    const c2 = await db.center.findFirstOrThrow({
      where: { admins: { some: { userId: other.userId } } },
    });
    await expectAppError(
      requestMembership(db, t.userId, c2.id, T0),
      "HAS_CENTER",
    );
  });

  it("트레이너가 센터 만들기 → 센터 권한 + 소속, 센터 기본 규칙이 새 트레이너의 초기값", async () => {
    const t = await makeUser("TRAINER");
    const center = await createCenterForTrainer(
      db,
      t.userId,
      { name: "내 센터", address: "서울", phone: "0212345678" },
      T0,
    );
    expect(
      (
        await db.trainerProfile.findUniqueOrThrow({
          where: { userId: t.userId },
        })
      ).hasCenterAdmin,
    ).toBe(true);
    const { updateCenterDefaultRules } = await import("./center-service");
    await updateCenterDefaultRules(
      db,
      t.userId,
      {
        lateCancelHours: 12,
        lateCancelDeduct: true,
        noShowMinutes: 10,
        noShowDeduct: true,
        lateGraceMinutes: 15,
        unapprovedAutoCompleteDays: 7,
        changeDeadlineHours: 24,
        pauseMaxDays: 30,
        pauseMaxCount: 2,
      },
      T0,
    );
    const newbie = await makeUser("TRAINER");
    const { code } = await createInvite(db, t.userId, "TRAINER", T0);
    await joinWithInvite(db, newbie.userId, code, true, T0);
    const { getTrainerDefaultRuleSet } =
      await import("@/server/rules/rule-service");
    expect(
      (await getTrainerDefaultRuleSet(db, newbie.userId)).lateCancelHours,
    ).toBe(12);
    expect(center.name).toBe("내 센터");
  });
});

describe("완료 기준: 센터는 소속 범위만", () => {
  it("다른 트레이너의 일정·수강생·결제는 보이지 않는다", async () => {
    const { admin, trainers } = await centerWithTrainers(1);
    const outsider = await makeUser("TRAINER");
    const a = await studentOf(trainers[0].userId);
    const b = await studentOf(outsider.userId);
    await book(
      trainers[0].userId,
      a.studentId,
      kstDateTime(2026, 11, 20, 19),
      a.userId,
    );
    await book(
      outsider.userId,
      b.studentId,
      kstDateTime(2026, 11, 20, 19),
      b.userId,
    );

    const cal = await getCenterCalendar(
      db,
      admin.userId,
      "2026-11-16",
      "2026-11-22",
    );
    expect(cal.bookings.map((x) => x.studentName)).toEqual([a.name]);
    const st = await getCenterStudents(db, admin.userId);
    expect(st.students.map((x) => x.name)).toEqual([a.name]);
    const pay = await getCenterPayments(
      db,
      admin.userId,
      "2026-11-01",
      "2026-11-30",
    );
    expect(pay.items.map((x) => x.studentName)).toEqual([a.name]);
    // 센터 관리자가 아니면 센터 화면 불가
    await expectAppError(
      getCenterCalendar(db, outsider.userId, "2026-11-16", "2026-11-22"),
      "FORBIDDEN",
    );
    // 본 기록은 이력으로 남는다
    expect(
      await db.auditLog.count({
        where: { action: { startsWith: "center.view." } },
      }),
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("완료 기준: 본인 관련 승인 불가", () => {
  it("관리자가 이전·새 트레이너인 이용권 이동은 스스로 승인할 수 없고, 다른 관리자는 가능", async () => {
    const owner = await makeUser("TRAINER");
    await createCenterForTrainer(
      db,
      owner.userId,
      { name: "센터", address: "서울", phone: "0212345678" },
      T0,
    );
    const t2 = await makeUser("TRAINER");
    const { code } = await createInvite(db, owner.userId, "TRAINER", T0);
    await joinWithInvite(db, t2.userId, code, true, T0);
    const s = await studentOf(owner.userId);
    // 수강생이 t2로 변경 요청 → 이용권 넘기기 대기
    const t = await startTransfer(
      db,
      { initiator: "STUDENT", actorUserId: s.userId, toTrainerId: t2.userId },
      T0,
    );
    expect(t.passTransfer).toBe("PENDING");
    await expectAppError(
      centerApprovePassTransfer(
        db,
        { adminId: owner.userId, transferId: t.id },
        T0,
      ),
      "FORBIDDEN",
    );
    // 다른 관리자 추가 → 승인 가능
    const boss = await makeUser("CENTER_ADMIN", {
      center: { name: "임시", address: "x", phone: "0211112222" },
    });
    const { code: adminCode } = await createInvite(
      db,
      owner.userId,
      "ADMIN",
      T0,
    );
    await db.centerAdmin.deleteMany({ where: { userId: boss.userId } });
    await acceptAdminInvite(db, boss.userId, adminCode, T0);
    await centerApprovePassTransfer(
      db,
      { adminId: boss.userId, transferId: t.id },
      T0,
    );
    expect(
      (await db.transferRequest.findUniqueOrThrow({ where: { id: t.id } }))
        .passTransfer,
    ).toBe("CENTER_APPROVED");
  });
});

describe("완료 기준: 이동 후 이전 센터 조회 범위", () => {
  it("이동 전 기간의 결제·수업만, 따라간 수강생 연락처는 가림", async () => {
    const { admin, trainers } = await centerWithTrainers(1);
    const t = trainers[0];
    const s = await studentOf(t.userId, kstDateTime(2026, 11, 13));
    const before = await book(
      t.userId,
      s.studentId,
      kstDateTime(2026, 11, 16, 19),
      s.userId,
    );
    await runApprovalJobs(db, kstDateTime(2026, 11, 16, 20));
    await approveWithPin(
      db,
      {
        method: "PIN_APP",
        studentUserId: s.userId,
        bookingId: before,
        pin: "1357",
      },
      kstDateTime(2026, 11, 16, 20),
    );

    // 11/17 이동 신청 → 수강생 "따라가기" → 7일 뒤(11/24) 적용
    const d = await requestMove(
      db,
      t.userId,
      null,
      kstDateTime(2026, 11, 17, 10),
    );
    const choice = await db.departureChoice.findFirstOrThrow({
      where: { departureId: d.id },
    });
    await chooseDeparture(
      db,
      { userId: s.userId, choiceId: choice.id, choice: "FOLLOW" },
      kstDateTime(2026, 11, 17, 11),
    );
    expect(
      (await runCenterJobs(db, kstDateTime(2026, 11, 24, 10, 1)))
        .departuresApplied,
    ).toBe(1);

    // 이동 뒤 수업·결제
    const after = await book(
      t.userId,
      s.studentId,
      kstDateTime(2026, 11, 26, 19),
      s.userId,
    );
    await createPass(
      db,
      t.userId,
      s.studentId,
      {
        name: "추가",
        count: 5,
        startDate: "2026-11-26",
        endDate: "2027-03-31",
        price: 300000,
        paidAt: "2026-11-26",
      },
      kstDateTime(2026, 11, 26),
    );

    const cal = await getCenterCalendar(
      db,
      admin.userId,
      "2026-11-15",
      "2026-11-30",
    );
    expect(cal.bookings.map((b) => b.id)).toEqual([before]);
    expect(cal.bookings.map((b) => b.id)).not.toContain(after);
    const pay = await getCenterPayments(
      db,
      admin.userId,
      "2026-11-01",
      "2026-11-30",
    );
    expect(pay.items.map((p) => p.price)).toEqual([500000]);
    const stats = await getCenterStats(
      db,
      admin.userId,
      "2026-11-01",
      "2026-11-30",
      kstDateTime(2026, 11, 30),
    );
    expect(
      stats.byTrainer.find((x) => x.trainerId === t.userId)?.rows[0],
    ).toMatchObject({ completed: 1 });
    // 따라간 수강생은 센터 수강생 목록에서 빠지고 연락처도 볼 수 없다
    expect((await getCenterStudents(db, admin.userId)).students).toHaveLength(
      0,
    );
  });

  it("남기를 고른 수강생은 담당 없음으로 센터에 남고, 센터가 새 트레이너 지정", async () => {
    const { admin, trainers } = await centerWithTrainers(2);
    const [t1, t2] = trainers;
    const s = await studentOf(t1.userId);
    const d = await releaseTrainer(db, admin.userId, t1.userId, T0);
    const c = await db.departureChoice.findFirstOrThrow({
      where: { departureId: d.id },
    });
    await chooseDeparture(
      db,
      { userId: s.userId, choiceId: c.id, choice: "STAY" },
      T0,
    );
    await runCenterJobs(db, new Date(T0.getTime() + 7 * DAY));
    const list = await getCenterStudents(db, admin.userId);
    expect(list.students).toEqual([
      expect.objectContaining({
        name: s.name,
        trainerId: null,
        phoneMasked: null,
      }),
    ]);
    const tr = await startTransfer(
      db,
      {
        initiator: "CENTER_ADMIN",
        actorUserId: admin.userId,
        studentId: s.studentId,
        toTrainerId: t2.userId,
      },
      new Date(T0.getTime() + 7 * DAY),
    );
    expect(tr.passTransfer).toBe("NOT_NEEDED");
    await respondTransferAsNewTrainer(
      db,
      { trainerId: t2.userId, transferId: tr.id, accept: true },
      new Date(T0.getTime() + 7 * DAY),
    );
    await respondTransferAsStudent(
      db,
      { userId: s.userId, transferId: tr.id, agree: true },
      new Date(T0.getTime() + 7 * DAY),
    );
    expect(
      (await db.student.findUniqueOrThrow({ where: { id: s.studentId } }))
        .currentTrainerId,
    ).toBe(t2.userId);
  });
});

describe("담당 트레이너 변경 (인계)", () => {
  it("이전 트레이너 인계: 새 트레이너 수락(예약 유지·취소) → 수강생 동의 → 완료, 규칙 다시 동의", async () => {
    const t1 = await makeUser("TRAINER");
    const t2 = await makeUser("TRAINER");
    const s = await studentOf(t1.userId);
    const keep = await book(
      t1.userId,
      s.studentId,
      kstDateTime(2026, 11, 20, 19),
      s.userId,
    );
    const drop = await book(
      t1.userId,
      s.studentId,
      kstDateTime(2026, 11, 21, 19),
      s.userId,
    );
    await db.trainerStudentLink.updateMany({
      where: { trainerId: t1.userId },
      data: { memo: "무릎 주의" },
    });

    const tr = await startTransfer(
      db,
      {
        initiator: "TRAINER",
        actorUserId: t1.userId,
        studentId: s.studentId,
        toTrainerId: t2.userId,
        passAgree: true,
        memoTransfer: true,
      },
      T0,
    );
    await respondTransferAsNewTrainer(
      db,
      {
        trainerId: t2.userId,
        transferId: tr.id,
        accept: true,
        bookingDecisions: { [keep]: "KEEP", [drop]: "CANCEL" },
      },
      T0,
    );
    expect(
      (await db.student.findUniqueOrThrow({ where: { id: s.studentId } }))
        .currentTrainerId,
    ).toBe(t1.userId);
    await respondTransferAsStudent(
      db,
      { userId: s.userId, transferId: tr.id, agree: true },
      T0,
    );

    expect(
      (await db.student.findUniqueOrThrow({ where: { id: s.studentId } }))
        .currentTrainerId,
    ).toBe(t2.userId);
    expect(
      await db.booking.findUniqueOrThrow({ where: { id: keep } }),
    ).toMatchObject({ trainerId: t2.userId, status: "CONFIRMED" });
    expect(
      await db.booking.findUniqueOrThrow({ where: { id: drop } }),
    ).toMatchObject({ status: "CANCELED", deducted: false });
    const link = await db.trainerStudentLink.findFirstOrThrow({
      where: { trainerId: t2.userId, studentId: s.studentId },
    });
    expect(link).toMatchObject({ memo: "무릎 주의", memoTransferred: true });
    const pass = await db.pass.findUniqueOrThrow({ where: { id: s.pass.id } });
    expect(pass.status).toBe("ACTIVE");
    expect(pass.soldByTrainerId).toBe(t1.userId); // 결제 기록은 판매 트레이너
    expect(
      await db.ruleConsent.count({
        where: { passId: pass.id, status: "PENDING" },
      }),
    ).toBe(1);
  });

  it("이전 트레이너가 이용권 넘기기에 동의하지 않으면 사용 중지로 남는다", async () => {
    const t1 = await makeUser("TRAINER");
    const t2 = await makeUser("TRAINER");
    const s = await studentOf(t1.userId);
    const tr = await startTransfer(
      db,
      { initiator: "STUDENT", actorUserId: s.userId, toTrainerId: t2.userId },
      T0,
    );
    await respondTransferAsNewTrainer(
      db,
      { trainerId: t2.userId, transferId: tr.id, accept: true },
      T0,
    );
    expect(
      (await db.pass.findUniqueOrThrow({ where: { id: s.pass.id } })).status,
    ).toBe("SUSPENDED");
    await decidePassTransfer(
      db,
      { trainerId: t1.userId, transferId: tr.id, agree: false },
      T0,
    );
    expect(
      (await db.pass.findUniqueOrThrow({ where: { id: s.pass.id } })).status,
    ).toBe("SUSPENDED");
  });

  it("담당이 바뀐 뒤 넘기기에 동의하면 그때 넘어간다", async () => {
    const t1 = await makeUser("TRAINER");
    const t2 = await makeUser("TRAINER");
    const s = await studentOf(t1.userId);
    const tr = await startTransfer(
      db,
      { initiator: "STUDENT", actorUserId: s.userId, toTrainerId: t2.userId },
      T0,
    );
    await respondTransferAsNewTrainer(
      db,
      { trainerId: t2.userId, transferId: tr.id, accept: true },
      T0,
    );
    await decidePassTransfer(
      db,
      { trainerId: t1.userId, transferId: tr.id, agree: true },
      T0,
    );
    expect(
      (await db.pass.findUniqueOrThrow({ where: { id: s.pass.id } })).status,
    ).toBe("ACTIVE");
  });
});

describe("탈퇴 선택 기본값 · 해산 · 마지막 관리자", () => {
  it("센터 소속 트레이너 탈퇴: 무응답은 센터가 정한 새 트레이너", async () => {
    const { trainers } = await centerWithTrainers(1);
    const s = await studentOf(trainers[0].userId);
    const d = await db.$transaction((tx) =>
      startDeparture(
        tx,
        {
          trainerId: trainers[0].userId,
          type: "WITHDRAW",
          createdBy: trainers[0].userId,
        },
        T0,
      ),
    );
    await expectAppError(
      chooseDeparture(
        db,
        {
          userId: s.userId,
          choiceId: (
            await db.departureChoice.findFirstOrThrow({
              where: { departureId: d.id },
            })
          ).id,
          choice: "FOLLOW",
        },
        T0,
      ),
      "INVALID",
    );
    await runCenterJobs(db, new Date(T0.getTime() + 5 * DAY));
    expect(
      await db.departureChoice.findFirstOrThrow({
        where: { departureId: d.id },
      }),
    ).toMatchObject({ choice: "CENTER_ASSIGN", defaulted: true });
    expect(
      (await db.student.findUniqueOrThrow({ where: { id: s.studentId } }))
        .currentTrainerId,
    ).toBeNull();
  });

  it("개인 트레이너 탈퇴: 무응답은 담당 트레이너 없음", async () => {
    const t = await makeUser("TRAINER");
    const s = await studentOf(t.userId);
    const d = await db.$transaction((tx) =>
      startDeparture(
        tx,
        { trainerId: t.userId, type: "WITHDRAW", createdBy: t.userId },
        T0,
      ),
    );
    await runCenterJobs(db, new Date(T0.getTime() + 5 * DAY));
    expect(
      await db.departureChoice.findFirstOrThrow({
        where: { departureId: d.id },
      }),
    ).toMatchObject({ choice: "FIND_OWN", defaulted: true });
    expect(
      (await db.student.findUniqueOrThrow({ where: { id: s.studentId } }))
        .currentTrainerId,
    ).toBeNull();
  });

  it("해산: 7일 뒤 개인 트레이너로, 센터 화면 사라짐", async () => {
    const { admin, trainers } = await centerWithTrainers(1);
    await startDissolve(db, admin.userId, T0);
    await runCenterJobs(db, new Date(T0.getTime() + 7 * DAY));
    expect(
      await db.centerMembership.count({
        where: { trainerId: trainers[0].userId, status: "ACTIVE" },
      }),
    ).toBe(0);
    await expectAppError(
      getCenterStats(db, admin.userId, "2026-11-01", "2026-11-30"),
      "FORBIDDEN",
    );
  });

  it("마지막 관리자는 다른 관리자 지정 또는 해산 전에는 탈퇴 불가", async () => {
    const owner = await makeUser("TRAINER");
    await createCenterForTrainer(
      db,
      owner.userId,
      { name: "센터", address: "서울", phone: "0212345678" },
      T0,
    );
    expect(await canAdminWithdraw(db, owner.userId)).toEqual({
      ok: false,
      centerName: "센터",
    });
    const other = await makeUser("TRAINER");
    const { code } = await createInvite(db, owner.userId, "ADMIN", T0);
    await acceptAdminInvite(db, other.userId, code, T0);
    expect(await canAdminWithdraw(db, owner.userId)).toEqual({ ok: true });
  });
});
