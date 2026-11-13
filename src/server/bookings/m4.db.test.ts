import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { kstDateTime } from "@/lib/time";
import { AppError } from "@/server/errors";
import { getAvailableCount } from "@/server/passes/availability-service";
import { createPass } from "@/server/passes/pass-service";
import { respondRuleConsent } from "@/server/rules/rule-service";
import {
  registerTemporaryStudent,
  respondLinkRequest,
} from "@/server/students/student-service";
import { resetDb, seedTerms, testDb } from "@/test/db-helpers";
import { T0, makeUser, resetFactorySeq } from "@/test/factories";
import {
  approveWithPin,
  markNoShow,
  raiseDispute,
  resolveDispute,
  runApprovalJobs,
  trainerConfirmCompletion,
} from "./approval-service";
import {
  cancelByTrainer,
  createBookingsByTrainer,
  respondConfirmRequest,
} from "./booking-service";

const db = testDb();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy(
    (e: unknown) => e instanceof AppError && e.code === code,
  );
}

const START = kstDateTime(2026, 11, 16, 19);
const END = kstDateTime(2026, 11, 16, 19, 50);

/** 확정된 수업 하나 (11/16 19:00~19:50) */
async function setup(opts: { agree?: boolean; count?: number } = {}) {
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
  const pass = await createPass(
    db,
    trainer.userId,
    studentId,
    {
      name: "PT",
      count: opts.count ?? 10,
      startDate: "2026-11-01",
      endDate: "2027-01-31",
    },
    T0,
  );
  if (opts.agree !== false) {
    const c = await db.ruleConsent.findFirstOrThrow({
      where: { passId: pass.id },
    });
    await respondRuleConsent(
      db,
      { studentUserId: student.userId, consentId: c.id, action: "AGREE" },
      T0,
    );
  }
  const r = await createBookingsByTrainer(
    db,
    {
      trainerId: trainer.userId,
      studentId,
      start: START,
      acknowledgeWarnings: true,
    },
    T0,
  );
  if (r.needsConfirmation) throw new Error();
  const bookingId = r.created[0];
  await respondConfirmRequest(
    db,
    { userId: student.userId, bookingId, accept: true },
    T0,
  );
  return { trainer, student, studentId, pass, bookingId };
}

const get = (id: string) => db.booking.findUniqueOrThrow({ where: { id } });

beforeEach(async () => {
  await resetDb(db);
  await seedTerms(db);
  resetFactorySeq();
});
afterAll(async () => db.$disconnect());

describe("수업 종료 → 완료 승인 대기", () => {
  it("종료 시각에 자동으로 승인 요청", async () => {
    const s = await setup();
    expect(
      (await runApprovalJobs(db, new Date(END.getTime() - 1))).approvalStarted,
    ).toBe(0);
    expect((await runApprovalJobs(db, END)).approvalStarted).toBe(1);
    expect(await get(s.bookingId)).toMatchObject({
      status: "PENDING_APPROVAL",
      approvalRequestedAt: END,
      approvalRequestedBy: s.trainer.userId,
    });
  });
});

describe("PIN 승인", () => {
  it("현장 PIN(트레이너 기기) → 완료, 1회 차감", async () => {
    const s = await setup();
    await runApprovalJobs(db, END);
    await approveWithPin(
      db,
      {
        method: "PIN_ONSITE",
        trainerId: s.trainer.userId,
        bookingId: s.bookingId,
        pin: "1357",
      },
      END,
    );
    expect(await get(s.bookingId)).toMatchObject({
      status: "COMPLETED",
      approvalMethod: "PIN_ONSITE",
      approvedAt: END,
      deducted: true,
      deductReason: "COMPLETED",
      passId: s.pass.id,
    });
    expect(await getAvailableCount(db, s.studentId, "2026-11-20")).toBe(9);
    expect(
      (await db.pass.findUniqueOrThrow({ where: { id: s.pass.id } })).usedCount,
    ).toBe(1);
  });

  it("앱 PIN(수강생 요청함)", async () => {
    const s = await setup();
    await runApprovalJobs(db, END);
    await approveWithPin(
      db,
      {
        method: "PIN_APP",
        studentUserId: s.student.userId,
        bookingId: s.bookingId,
        pin: "1357",
      },
      END,
    );
    expect((await get(s.bookingId)).approvalMethod).toBe("PIN_APP");
  });

  it("PIN 5회 오류 → 잠금, 맞는 PIN도 거부", async () => {
    const s = await setup();
    await runApprovalJobs(db, END);
    const attempt = (pin: string) =>
      approveWithPin(
        db,
        {
          method: "PIN_ONSITE",
          trainerId: s.trainer.userId,
          bookingId: s.bookingId,
          pin,
        },
        END,
      );
    for (let i = 0; i < 4; i++)
      await expectAppError(attempt("0000"), "WRONG_PIN");
    await expectAppError(attempt("0000"), "PIN_LOCKED");
    await expectAppError(attempt("1357"), "PIN_LOCKED");
    expect((await get(s.bookingId)).status).toBe("PENDING_APPROVAL");
  });

  it("승인 대기 전(수업 중)에는 승인 불가, 완료된 수업은 되돌릴 수 없다", async () => {
    const s = await setup();
    await expectAppError(
      approveWithPin(
        db,
        {
          method: "PIN_APP",
          studentUserId: s.student.userId,
          bookingId: s.bookingId,
          pin: "1357",
        },
        START,
      ),
      "INVALID_TRANSITION",
    );
    await runApprovalJobs(db, END);
    await approveWithPin(
      db,
      {
        method: "PIN_APP",
        studentUserId: s.student.userId,
        bookingId: s.bookingId,
        pin: "1357",
      },
      END,
    );
    await expectAppError(
      markNoShow(
        db,
        { trainerId: s.trainer.userId, bookingId: s.bookingId },
        END,
      ),
      "INVALID_TRANSITION",
    );
    await expectAppError(
      cancelByTrainer(
        db,
        { trainerId: s.trainer.userId, bookingId: s.bookingId },
        END,
      ),
      "INVALID_TRANSITION",
    );
  });

  it("미가입 수강생은 PIN으로 승인할 수 없다", async () => {
    const trainer = await makeUser("TRAINER");
    const temp = await registerTemporaryStudent(
      db,
      trainer.userId,
      { name: "미가입", phone: "01066660000" },
      T0,
    );
    await createPass(
      db,
      trainer.userId,
      temp.id,
      { name: "PT", count: 5, startDate: "2026-11-01", endDate: "2027-01-31" },
      T0,
    );
    const r = await createBookingsByTrainer(
      db,
      {
        trainerId: trainer.userId,
        studentId: temp.id,
        start: START,
        acknowledgeWarnings: true,
      },
      T0,
    );
    if (r.needsConfirmation) throw new Error();
    await db.booking.update({
      where: { id: r.created[0] },
      data: { status: "CONFIRMED" },
    });
    await runApprovalJobs(db, END);
    await expectAppError(
      approveWithPin(
        db,
        {
          method: "PIN_ONSITE",
          trainerId: trainer.userId,
          bookingId: r.created[0],
          pin: "1357",
        },
        END,
      ),
      "NOT_REGISTERED",
    );
  });
});

describe("노쇼·취소 (24시간 변경 창)", () => {
  it("예약 확정: 시작 + 판정 시간(15분) 뒤부터 노쇼, 동의했으면 1회 차감", async () => {
    const s = await setup();
    await expectAppError(
      markNoShow(
        db,
        { trainerId: s.trainer.userId, bookingId: s.bookingId },
        new Date(START.getTime() + 14 * MIN),
      ),
      "TOO_EARLY",
    );
    const r = await markNoShow(
      db,
      { trainerId: s.trainer.userId, bookingId: s.bookingId },
      new Date(START.getTime() + 15 * MIN),
    );
    expect(r.deducted).toBe(true);
    expect(await get(s.bookingId)).toMatchObject({
      status: "NO_SHOW",
      deducted: true,
      deductReason: "NO_SHOW",
    });
    expect(await getAvailableCount(db, s.studentId, "2026-11-20")).toBe(9);
  });

  it("규칙 미동의 수강생의 노쇼는 기록만 하고 차감 안 함", async () => {
    const s = await setup({ agree: false });
    const r = await markNoShow(
      db,
      { trainerId: s.trainer.userId, bookingId: s.bookingId },
      new Date(START.getTime() + 20 * MIN),
    );
    expect(r).toMatchObject({ deducted: false, skippedReason: "NO_CONSENT" });
    expect(await get(s.bookingId)).toMatchObject({
      status: "NO_SHOW",
      deducted: false,
      deductSkippedReason: "NO_CONSENT",
    });
    expect(await getAvailableCount(db, s.studentId, "2026-11-20")).toBe(10);
  });

  it("완료 승인 대기는 종료 후 24시간 안에만 노쇼·취소로 바꿀 수 있다", async () => {
    const s = await setup();
    await runApprovalJobs(db, END);
    await expectAppError(
      markNoShow(
        db,
        { trainerId: s.trainer.userId, bookingId: s.bookingId },
        new Date(END.getTime() + DAY + 1),
      ),
      "TOO_LATE",
    );
    await expectAppError(
      cancelByTrainer(
        db,
        { trainerId: s.trainer.userId, bookingId: s.bookingId },
        new Date(END.getTime() + DAY + 1),
      ),
      "INVALID_TRANSITION",
    );
    await cancelByTrainer(
      db,
      { trainerId: s.trainer.userId, bookingId: s.bookingId },
      new Date(END.getTime() + DAY),
    );
    expect(await get(s.bookingId)).toMatchObject({
      status: "CANCELED",
      deducted: false,
    });
  });
});

describe("미승인 기한", () => {
  it("동의한 수강생: 7일 뒤 자동 완료", async () => {
    const s = await setup();
    await runApprovalJobs(db, END);
    expect(
      (await runApprovalJobs(db, new Date(END.getTime() + 7 * DAY - 1)))
        .autoCompleted,
    ).toBe(0);
    expect(
      (await runApprovalJobs(db, new Date(END.getTime() + 7 * DAY)))
        .autoCompleted,
    ).toBe(1);
    expect(await get(s.bookingId)).toMatchObject({
      status: "COMPLETED",
      approvalMethod: "AUTO",
      deducted: true,
    });
  });

  it("미동의 수강생: 자동 완료하지 않고 트레이너 확정", async () => {
    const s = await setup({ agree: false });
    await runApprovalJobs(db, END);
    await expectAppError(
      trainerConfirmCompletion(
        db,
        { trainerId: s.trainer.userId, bookingId: s.bookingId },
        END,
      ),
      "INVALID",
    );
    const r = await runApprovalJobs(db, new Date(END.getTime() + 7 * DAY));
    expect(r).toMatchObject({ autoCompleted: 0, trainerConfirmNeeded: 1 });
    expect(await get(s.bookingId)).toMatchObject({
      status: "PENDING_APPROVAL",
      trainerConfirmNeeded: true,
    });
    await trainerConfirmCompletion(
      db,
      { trainerId: s.trainer.userId, bookingId: s.bookingId },
      new Date(END.getTime() + 8 * DAY),
    );
    expect(await get(s.bookingId)).toMatchObject({
      status: "COMPLETED",
      approvalMethod: "TRAINER_CONFIRM",
      deducted: true,
    });
  });
});

describe("거절과 이의 제기", () => {
  it("완료 거절 → 기존 처리 유지 → 완료(이견 처리), 다시 요청 불가", async () => {
    const s = await setup();
    await runApprovalJobs(db, END);
    await expectAppError(
      raiseDispute(
        db,
        {
          studentUserId: s.student.userId,
          bookingId: s.bookingId,
          reason: " ",
        },
        END,
      ),
      "INVALID",
    );
    await raiseDispute(
      db,
      {
        studentUserId: s.student.userId,
        bookingId: s.bookingId,
        reason: "수업 시간이 짧았어요",
      },
      END,
    );
    expect(await get(s.bookingId)).toMatchObject({
      disputed: true,
      disputeKind: "COMPLETION_REJECTED",
    });
    // 이견 중에는 PIN 승인·자동 완료 안 함
    await expectAppError(
      approveWithPin(
        db,
        {
          method: "PIN_APP",
          studentUserId: s.student.userId,
          bookingId: s.bookingId,
          pin: "1357",
        },
        END,
      ),
      "DISPUTED",
    );
    expect(
      (await runApprovalJobs(db, new Date(END.getTime() + 6 * DAY)))
        .autoCompleted,
    ).toBe(0);
    await resolveDispute(
      db,
      {
        trainerId: s.trainer.userId,
        bookingId: s.bookingId,
        decision: "KEEP",
        reason: "정상 진행",
      },
      END,
    );
    expect(await get(s.bookingId)).toMatchObject({
      status: "COMPLETED",
      approvalMethod: "DISPUTE_RESOLUTION",
      disputeTrainerDecision: "KEEP",
      disputeStudentReason: "수업 시간이 짧았어요",
      disputeTrainerReason: "정상 진행",
      deducted: true,
    });
    await expectAppError(
      raiseDispute(
        db,
        {
          studentUserId: s.student.userId,
          bookingId: s.bookingId,
          reason: "다시",
        },
        END,
      ),
      "ALREADY",
    );
  });

  it("완료 거절 → 수강생 의견 수락 → 차감 없이 취소", async () => {
    const s = await setup();
    await runApprovalJobs(db, END);
    await raiseDispute(
      db,
      {
        studentUserId: s.student.userId,
        bookingId: s.bookingId,
        reason: "안 했어요",
      },
      END,
    );
    await resolveDispute(
      db,
      {
        trainerId: s.trainer.userId,
        bookingId: s.bookingId,
        decision: "ACCEPT_STUDENT",
      },
      new Date(END.getTime() + 3 * DAY),
    );
    expect(await get(s.bookingId)).toMatchObject({
      status: "CANCELED",
      deducted: false,
      disputeTrainerDecision: "ACCEPT_STUDENT",
    });
  });

  it("노쇼 이의 → 수강생 의견 수락 → 취소 + 차감 되돌림", async () => {
    const s = await setup();
    await markNoShow(
      db,
      { trainerId: s.trainer.userId, bookingId: s.bookingId },
      END,
    );
    expect(await getAvailableCount(db, s.studentId, "2026-11-20")).toBe(9);
    await raiseDispute(
      db,
      {
        studentUserId: s.student.userId,
        bookingId: s.bookingId,
        reason: "연락드렸어요",
      },
      END,
    );
    await resolveDispute(
      db,
      {
        trainerId: s.trainer.userId,
        bookingId: s.bookingId,
        decision: "ACCEPT_STUDENT",
      },
      END,
    );
    expect(await get(s.bookingId)).toMatchObject({
      status: "CANCELED",
      deducted: false,
    });
    expect(await getAvailableCount(db, s.studentId, "2026-11-20")).toBe(10);
    expect(
      (await db.pass.findUniqueOrThrow({ where: { id: s.pass.id } }))
        .deductedNoShow,
    ).toBe(0);
  });

  it("노쇼 이의 → 기존 처리 유지 → 노쇼 그대로", async () => {
    const s = await setup();
    await markNoShow(
      db,
      { trainerId: s.trainer.userId, bookingId: s.bookingId },
      END,
    );
    await raiseDispute(
      db,
      {
        studentUserId: s.student.userId,
        bookingId: s.bookingId,
        reason: "억울해요",
      },
      END,
    );
    await resolveDispute(
      db,
      { trainerId: s.trainer.userId, bookingId: s.bookingId, decision: "KEEP" },
      END,
    );
    expect(await get(s.bookingId)).toMatchObject({
      status: "NO_SHOW",
      deducted: true,
      disputeTrainerDecision: "KEEP",
    });
  });

  it("트레이너가 7일 안에 고르지 않으면 수강생 의견 수락", async () => {
    const s = await setup();
    await markNoShow(
      db,
      { trainerId: s.trainer.userId, bookingId: s.bookingId },
      END,
    );
    await raiseDispute(
      db,
      { studentUserId: s.student.userId, bookingId: s.bookingId, reason: "?" },
      END,
    );
    expect(
      (await runApprovalJobs(db, new Date(END.getTime() + 7 * DAY - 1)))
        .disputesResolved,
    ).toBe(0);
    expect(
      (await runApprovalJobs(db, new Date(END.getTime() + 7 * DAY)))
        .disputesResolved,
    ).toBe(1);
    expect(await get(s.bookingId)).toMatchObject({
      status: "CANCELED",
      disputeTrainerDecision: "ACCEPT_STUDENT",
    });
  });

  it("다른 수강생은 이의를 제기할 수 없다", async () => {
    const s = await setup();
    await markNoShow(
      db,
      { trainerId: s.trainer.userId, bookingId: s.bookingId },
      END,
    );
    const other = await makeUser("STUDENT");
    await expectAppError(
      raiseDispute(
        db,
        { studentUserId: other.userId, bookingId: s.bookingId, reason: "x" },
        END,
      ),
      "NOT_FOUND",
    );
  });
});

describe("차감과 잔여 부족 연결", () => {
  it("노쇼 차감으로 잔여보다 예약이 많아지면 나중 예약이 잔여 부족", async () => {
    const s = await setup({ count: 2 });
    const r = await createBookingsByTrainer(
      db,
      {
        trainerId: s.trainer.userId,
        studentId: s.studentId,
        start: kstDateTime(2026, 11, 20, 19),
        acknowledgeWarnings: true,
      },
      T0,
    );
    if (r.needsConfirmation) throw new Error();
    await markNoShow(
      db,
      { trainerId: s.trainer.userId, bookingId: s.bookingId },
      END,
    );
    // 잔여 1, 예정 1 → 아직 괜찮음
    expect((await get(r.created[0])).status).toBe("PENDING_CONFIRM");
    const r2 = await createBookingsByTrainer(
      db,
      {
        trainerId: s.trainer.userId,
        studentId: s.studentId,
        start: kstDateTime(2026, 11, 22, 19),
        acknowledgeWarnings: true,
      },
      END,
    ).catch((e) => e);
    expect(r2).toBeInstanceOf(AppError);
  });
});
