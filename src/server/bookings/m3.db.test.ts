import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { kstDateTime } from "@/lib/time";
import { AppError } from "@/server/errors";
import { getAvailableCount } from "@/server/passes/availability-service";
import { createPass, refundPass } from "@/server/passes/pass-service";
import { respondRuleConsent } from "@/server/rules/rule-service";
import { respondLinkRequest } from "@/server/students/student-service";
import { resetDb, seedTerms, testDb } from "@/test/db-helpers";
import { T0, makeUser, resetFactorySeq } from "@/test/factories";
import { saveAvailability } from "./availability-settings";
import {
  cancelByTrainer,
  chooseProposal,
  createBookingsByTrainer,
  proposeOtherTimes,
  requestBookingByStudent,
  requestCancelByStudent,
  requestTimeChange,
  respondBookingRequest,
  respondCancelRequest,
  respondConfirmRequest,
  respondTimeChange,
  runBookingJobs,
  withdrawBookingRequest,
  type TrainerCreateResult,
} from "./booking-service";
import { getStudentCalendar } from "./calendar-service";

const db = testDb();
const HOUR = 3600_000;

async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy(
    (e: unknown) => e instanceof AppError && e.code === code,
  );
}

/** 트레이너 + 연결된 가입 수강생 + 이용권(규칙 동의) + 근무 시간(평일 09~22시) */
async function setup(
  opts: { count?: number; agree?: boolean; endDate?: string } = {},
) {
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
      endDate: opts.endDate ?? "2027-01-31",
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
  await saveAvailability(
    db,
    trainer.userId,
    {
      rules: [1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        startTime: "09:00",
        endTime: "22:00",
      })),
      exceptions: [],
    },
    T0,
  );
  return { trainer, student, studentId, pass };
}

function created(r: TrainerCreateResult) {
  if (r.needsConfirmation) throw new Error("경고 확인 필요");
  return r;
}

async function trainerBook(
  s: Awaited<ReturnType<typeof setup>>,
  start: Date,
  extra: object = {},
) {
  return created(
    await createBookingsByTrainer(
      db,
      {
        trainerId: s.trainer.userId,
        studentId: s.studentId,
        start,
        acknowledgeWarnings: true,
        ...extra,
      },
      T0,
    ),
  );
}

const status = async (id: string) =>
  (await db.booking.findUniqueOrThrow({ where: { id } })).status;

beforeEach(async () => {
  await resetDb(db);
  await seedTerms(db);
  resetFactorySeq();
});
afterAll(async () => db.$disconnect());

// T0 = 2026-11-13(금) 10:00 KST
const MON_19 = kstDateTime(2026, 11, 16, 19);

describe("트레이너 예약 등록 → 확정", () => {
  it("등록하면 확정 대기, 수강생 수락 → 예약 확정", async () => {
    const s = await setup();
    const r = await trainerBook(s, MON_19);
    expect(r.created).toHaveLength(1);
    const id = r.created[0];
    expect(await status(id)).toBe("PENDING_CONFIRM");
    const b = await db.booking.findUniqueOrThrow({ where: { id } });
    expect(b.endAt.getTime() - b.startAt.getTime()).toBe(50 * 60_000);
    await respondConfirmRequest(
      db,
      { userId: s.student.userId, bookingId: id, accept: true },
      T0,
    );
    expect(await status(id)).toBe("CONFIRMED");
    expect(await db.bookingStatusLog.count({ where: { bookingId: id } })).toBe(
      2,
    );
  });

  it("경고: 근무 시간 밖·규칙 미동의는 확인 후 등록", async () => {
    const s = await setup({ agree: false });
    const sat = kstDateTime(2026, 11, 21, 10);
    const r = await createBookingsByTrainer(
      db,
      { trainerId: s.trainer.userId, studentId: s.studentId, start: sat },
      T0,
    );
    expect(r.needsConfirmation).toBe(true);
    if (r.needsConfirmation) {
      expect(r.warnings.map((w) => w.code).sort()).toEqual([
        "OUTSIDE_HOURS",
        "RULE_UNAGREED",
      ]);
      expect(r.warnings.find((w) => w.code === "RULE_UNAGREED")?.text).toBe(
        "수강 규칙에 동의하지 않은 수강생입니다",
      );
    }
    expect(await db.booking.count()).toBe(0);
    await trainerBook(s, sat);
    expect(await db.booking.count()).toBe(1);
  });

  it("경고: 야간에 다음 날 아침 수업을 잡으면 확정 요청이 늦게 닿는다", async () => {
    const s = await setup();
    const night = kstDateTime(2026, 11, 16, 22);
    const r = await createBookingsByTrainer(
      db,
      {
        trainerId: s.trainer.userId,
        studentId: s.studentId,
        start: kstDateTime(2026, 11, 17, 7, 30),
      },
      night,
    );
    expect(r.needsConfirmation && r.warnings.map((w) => w.code)).toContain(
      "LATE_NOTICE",
    );
  });

  it("예약 가능 횟수 0이면 등록 불가 (이용권 추가 안내)", async () => {
    const s = await setup({ count: 1 });
    await trainerBook(s, MON_19);
    await expectAppError(
      createBookingsByTrainer(
        db,
        {
          trainerId: s.trainer.userId,
          studentId: s.studentId,
          start: kstDateTime(2026, 11, 17, 19),
          acknowledgeWarnings: true,
        },
        T0,
      ),
      "NO_REMAINING",
    );
  });

  it("만료일 이후 날짜는 예약 불가", async () => {
    const s = await setup({ endDate: "2026-11-30" });
    await expectAppError(
      createBookingsByTrainer(
        db,
        {
          trainerId: s.trainer.userId,
          studentId: s.studentId,
          start: kstDateTime(2026, 12, 1, 19),
          acknowledgeWarnings: true,
        },
        T0,
      ),
      "NO_REMAINING",
    );
  });

  it("반복 예약은 예약 가능 횟수만큼만, 나머지 수를 알려 준다", async () => {
    const s = await setup({ count: 5 });
    const r = await trainerBook(s, MON_19, {
      recurrence: { weekdays: [1, 3], count: 8 },
    });
    expect(r.created).toHaveLength(5);
    expect(r.skippedInsufficient).toBe(3);
    expect(r.recurringGroupId).toBeTruthy();
    // 묶어서 한 번에 수락
    const n = await respondConfirmRequest(
      db,
      {
        userId: s.student.userId,
        bookingId: r.created[0],
        accept: true,
        wholeGroup: true,
      },
      T0,
    );
    expect(n).toBe(5);
    expect(await db.booking.count({ where: { status: "CONFIRMED" } })).toBe(5);
  });
});

describe("같은 시간 중복 차단", () => {
  it("트레이너 등록: 겹치면 불가, 맞닿으면 가능", async () => {
    const s = await setup();
    await trainerBook(s, MON_19);
    await expectAppError(
      createBookingsByTrainer(
        db,
        {
          trainerId: s.trainer.userId,
          studentId: s.studentId,
          start: kstDateTime(2026, 11, 16, 19, 30),
          acknowledgeWarnings: true,
        },
        T0,
      ),
      "OVERLAP",
    );
    await trainerBook(s, kstDateTime(2026, 11, 16, 19, 50));
  });

  it("다른 수강생이라도 트레이너 시간이 겹치면 불가", async () => {
    const s = await setup();
    await trainerBook(s, MON_19);
    const other = await makeUser("STUDENT", {
      trainer: { trainerUserId: s.trainer.userId },
    });
    const req = await db.linkRequest.findFirstOrThrow({
      where: { fromUserId: other.userId },
    });
    await respondLinkRequest(
      db,
      { userId: s.trainer.userId, requestId: req.id, accept: true },
      T0,
    );
    const otherId = (
      await db.student.findUniqueOrThrow({ where: { userId: other.userId } })
    ).id;
    await createPass(
      db,
      s.trainer.userId,
      otherId,
      { name: "PT", count: 5, startDate: "2026-11-01", endDate: "2027-01-31" },
      T0,
    );
    await expectAppError(
      createBookingsByTrainer(
        db,
        {
          trainerId: s.trainer.userId,
          studentId: otherId,
          start: MON_19,
          acknowledgeWarnings: true,
        },
        T0,
      ),
      "OVERLAP",
    );
    await expectAppError(
      requestBookingByStudent(
        db,
        { userId: other.userId, start: kstDateTime(2026, 11, 16, 19, 30) },
        T0,
      ),
      "OVERLAP",
    );
  });

  it("변경 요청도 겹치는 시간으로는 불가", async () => {
    const s = await setup();
    const a = (await trainerBook(s, MON_19)).created[0];
    await trainerBook(s, kstDateTime(2026, 11, 18, 19));
    await respondConfirmRequest(
      db,
      { userId: s.student.userId, bookingId: a, accept: true },
      T0,
    );
    await expectAppError(
      requestTimeChange(
        db,
        {
          actorUserId: s.trainer.userId,
          role: "TRAINER",
          bookingId: a,
          slots: [
            {
              start: kstDateTime(2026, 11, 18, 19, 20),
              end: kstDateTime(2026, 11, 18, 20, 10),
            },
          ],
        },
        T0,
      ),
      "OVERLAP",
    );
  });

  it("취소된 예약 시간은 다시 쓸 수 있다", async () => {
    const s = await setup();
    const a = (await trainerBook(s, MON_19)).created[0];
    await cancelByTrainer(
      db,
      { trainerId: s.trainer.userId, bookingId: a },
      T0,
    );
    await trainerBook(s, MON_19);
  });
});

describe("수강생 예약 신청", () => {
  it("빈 시간에 신청 → 트레이너 수락 → 확정", async () => {
    const s = await setup();
    const b = await requestBookingByStudent(
      db,
      { userId: s.student.userId, start: MON_19 },
      T0,
    );
    expect(b.status).toBe("REQUESTED");
    await respondBookingRequest(
      db,
      { trainerId: s.trainer.userId, bookingId: b.id, accept: true },
      T0,
    );
    expect(await status(b.id)).toBe("CONFIRMED");
  });

  it("근무 시간 밖·12시간 전 이후·대기 3건 초과는 불가", async () => {
    const s = await setup();
    await expectAppError(
      requestBookingByStudent(
        db,
        { userId: s.student.userId, start: kstDateTime(2026, 11, 14, 10) },
        T0,
      ),
      "OUTSIDE_HOURS",
    );
    await expectAppError(
      requestBookingByStudent(
        db,
        { userId: s.student.userId, start: kstDateTime(2026, 11, 13, 21) },
        T0,
      ),
      "TOO_LATE",
    );
    for (const d of [16, 17, 18]) {
      await requestBookingByStudent(
        db,
        { userId: s.student.userId, start: kstDateTime(2026, 11, d, 10) },
        T0,
      );
    }
    await expectAppError(
      requestBookingByStudent(
        db,
        { userId: s.student.userId, start: kstDateTime(2026, 11, 19, 10) },
        T0,
      ),
      "TOO_MANY_REQUESTS",
    );
  });

  it("근무 시간을 설정하지 않았으면 신청 불가", async () => {
    const s = await setup();
    await saveAvailability(
      db,
      s.trainer.userId,
      { rules: [], exceptions: [] },
      T0,
    );
    await expectAppError(
      requestBookingByStudent(
        db,
        { userId: s.student.userId, start: MON_19 },
        T0,
      ),
      "NO_AVAILABILITY",
    );
    const cal = await getStudentCalendar(
      db,
      s.student.userId,
      "2026-11-16",
      "2026-11-22",
      T0,
    );
    expect(cal.hasAvailability).toBe(false);
    expect(cal.slots).toHaveLength(0);
  });

  it("수락 시점에 예약 가능 횟수를 다시 확인", async () => {
    const s = await setup({ count: 1 });
    const req = await requestBookingByStudent(
      db,
      { userId: s.student.userId, start: MON_19 },
      T0,
    );
    // 그 사이 트레이너가 다른 예약을 잡을 수는 없다(신청이 횟수를 차지)
    await expectAppError(
      createBookingsByTrainer(
        db,
        {
          trainerId: s.trainer.userId,
          studentId: s.studentId,
          start: kstDateTime(2026, 11, 17, 19),
          acknowledgeWarnings: true,
        },
        T0,
      ),
      "NO_REMAINING",
    );
    await refundPass(db, s.trainer.userId, s.pass.id, T0);
    await expectAppError(
      respondBookingRequest(
        db,
        { trainerId: s.trainer.userId, bookingId: req.id, accept: true },
        T0,
      ),
      "INVALID_TRANSITION",
    );
  });

  it("신청 철회 / 거절", async () => {
    const s = await setup();
    const a = await requestBookingByStudent(
      db,
      { userId: s.student.userId, start: MON_19 },
      T0,
    );
    await withdrawBookingRequest(
      db,
      { userId: s.student.userId, bookingId: a.id },
      T0,
    );
    expect(await status(a.id)).toBe("CANCELED");
    const b = await requestBookingByStudent(
      db,
      { userId: s.student.userId, start: MON_19 },
      T0,
    );
    await respondBookingRequest(
      db,
      {
        trainerId: s.trainer.userId,
        bookingId: b.id,
        accept: false,
        reason: "개인 일정",
      },
      T0,
    );
    expect(
      await db.booking.findUniqueOrThrow({ where: { id: b.id } }),
    ).toMatchObject({ status: "REJECTED", rejectReason: "개인 일정" });
  });

  it("빈 시간 목록에는 다른 수강생 정보 없이 바쁜 시간만 빠진다", async () => {
    const s = await setup();
    await trainerBook(s, MON_19);
    const cal = await getStudentCalendar(
      db,
      s.student.userId,
      "2026-11-16",
      "2026-11-16",
      T0,
    );
    const starts = cal.slots.map((x) => new Date(x.start).getTime());
    expect(starts).not.toContain(MON_19.getTime());
    expect(starts).toContain(kstDateTime(2026, 11, 16, 20).getTime());
    expect(JSON.stringify(cal.slots)).not.toContain("studentName");
  });
});

describe("다른 시간 제안 · 시간 변경 요청", () => {
  it("확정 대기에 수강생이 다른 시간 제안 → 트레이너가 고르면 확정", async () => {
    const s = await setup();
    const id = (await trainerBook(s, MON_19)).created[0];
    const p = await proposeOtherTimes(
      db,
      {
        userId: s.student.userId,
        bookingId: id,
        slots: [
          {
            start: kstDateTime(2026, 11, 17, 10),
            end: kstDateTime(2026, 11, 17, 10, 50),
          },
          {
            start: kstDateTime(2026, 11, 18, 10),
            end: kstDateTime(2026, 11, 18, 10, 50),
          },
        ],
      },
      T0,
    );
    await chooseProposal(
      db,
      { trainerId: s.trainer.userId, requestId: p.id, index: 1 },
      T0,
    );
    const b = await db.booking.findUniqueOrThrow({ where: { id } });
    expect(b.status).toBe("CONFIRMED");
    expect(b.startAt).toEqual(kstDateTime(2026, 11, 18, 10));
  });

  it("확정된 예약 변경: 수락 전 원래 시간 유지, 수락하면 바뀜", async () => {
    const s = await setup();
    const id = (await trainerBook(s, MON_19)).created[0];
    await respondConfirmRequest(
      db,
      { userId: s.student.userId, bookingId: id, accept: true },
      T0,
    );
    const newSlot = {
      start: kstDateTime(2026, 11, 17, 19),
      end: kstDateTime(2026, 11, 17, 19, 50),
    };
    const req = await requestTimeChange(
      db,
      {
        actorUserId: s.trainer.userId,
        role: "TRAINER",
        bookingId: id,
        slots: [newSlot],
      },
      T0,
    );
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id } })).startAt,
    ).toEqual(MON_19);
    expect(req.expiresAt).toEqual(MON_19); // 원래·새 시간 중 빠른 시각
    // 요청한 쪽은 응답할 수 없다
    await expectAppError(
      respondTimeChange(
        db,
        {
          actorUserId: s.trainer.userId,
          role: "TRAINER",
          requestId: req.id,
          action: "ACCEPT",
        },
        T0,
      ),
      "FORBIDDEN",
    );
    await respondTimeChange(
      db,
      {
        actorUserId: s.student.userId,
        role: "STUDENT",
        requestId: req.id,
        action: "ACCEPT",
        index: 0,
      },
      T0,
    );
    const b = await db.booking.findUniqueOrThrow({ where: { id } });
    expect(b.startAt).toEqual(newSlot.start);
    expect(b.status).toBe("CONFIRMED");
  });

  it("거절하면 원래 시간, 다른 시간 제안은 새 요청", async () => {
    const s = await setup();
    const id = (await trainerBook(s, MON_19)).created[0];
    await respondConfirmRequest(
      db,
      { userId: s.student.userId, bookingId: id, accept: true },
      T0,
    );
    const r1 = await requestTimeChange(
      db,
      {
        actorUserId: s.student.userId,
        role: "STUDENT",
        bookingId: id,
        slots: [
          {
            start: kstDateTime(2026, 11, 17, 19),
            end: kstDateTime(2026, 11, 17, 19, 50),
          },
        ],
      },
      T0,
    );
    const r2 = await respondTimeChange(
      db,
      {
        actorUserId: s.trainer.userId,
        role: "TRAINER",
        requestId: r1.id,
        action: "COUNTER",
        slots: [
          {
            start: kstDateTime(2026, 11, 18, 19),
            end: kstDateTime(2026, 11, 18, 19, 50),
          },
        ],
      },
      T0,
    );
    expect(
      (
        await db.bookingChangeRequest.findUniqueOrThrow({
          where: { id: r1.id },
        })
      ).status,
    ).toBe("COUNTERED");
    await respondTimeChange(
      db,
      {
        actorUserId: s.student.userId,
        role: "STUDENT",
        requestId: r2!.id,
        action: "REJECT",
      },
      T0,
    );
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id } })).startAt,
    ).toEqual(MON_19);
  });

  it("규칙의 변경 기한(24시간 전)이 지나면 요청 불가", async () => {
    const s = await setup();
    const id = (await trainerBook(s, MON_19)).created[0];
    await respondConfirmRequest(
      db,
      { userId: s.student.userId, bookingId: id, accept: true },
      T0,
    );
    const late = new Date(MON_19.getTime() - 23 * HOUR);
    await expectAppError(
      requestTimeChange(
        db,
        {
          actorUserId: s.student.userId,
          role: "STUDENT",
          bookingId: id,
          slots: [
            {
              start: kstDateTime(2026, 11, 18, 19),
              end: kstDateTime(2026, 11, 18, 19, 50),
            },
          ],
        },
        late,
      ),
      "TOO_LATE",
    );
  });

  it("무응답이면 만료되고 원래 시간대로 진행", async () => {
    const s = await setup();
    const id = (await trainerBook(s, MON_19)).created[0];
    await respondConfirmRequest(
      db,
      { userId: s.student.userId, bookingId: id, accept: true },
      T0,
    );
    const req = await requestTimeChange(
      db,
      {
        actorUserId: s.trainer.userId,
        role: "TRAINER",
        bookingId: id,
        slots: [
          {
            start: kstDateTime(2026, 11, 20, 19),
            end: kstDateTime(2026, 11, 20, 19, 50),
          },
        ],
      },
      T0,
    );
    const r = await runBookingJobs(db, MON_19);
    expect(r.changeExpired).toBe(1);
    expect(
      (
        await db.bookingChangeRequest.findUniqueOrThrow({
          where: { id: req.id },
        })
      ).status,
    ).toBe("EXPIRED");
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id } })).startAt,
    ).toEqual(MON_19);
  });
});

describe("취소", () => {
  it("트레이너 취소: 바로, 차감 없음", async () => {
    const s = await setup();
    const id = (await trainerBook(s, MON_19)).created[0];
    await cancelByTrainer(
      db,
      { trainerId: s.trainer.userId, bookingId: id },
      T0,
    );
    expect(await db.booking.findUniqueOrThrow({ where: { id } })).toMatchObject(
      { status: "CANCELED", deducted: false },
    );
  });

  it("수강생 취소 요청 → 트레이너 수락. 차감은 요청 시각 기준 (늦게 수락돼도)", async () => {
    const s = await setup();
    const early = (await trainerBook(s, MON_19)).created[0];
    const late = (await trainerBook(s, kstDateTime(2026, 11, 18, 19)))
      .created[0];
    for (const id of [early, late])
      await respondConfirmRequest(
        db,
        { userId: s.student.userId, bookingId: id, accept: true },
        T0,
      );

    // 11/16 19시 수업: 25시간 전에 요청, 수락은 1시간 전 → 차감 없음
    await requestCancelByStudent(
      db,
      { userId: s.student.userId, bookingId: early },
      new Date(MON_19.getTime() - 25 * HOUR),
    );
    await respondCancelRequest(
      db,
      { trainerId: s.trainer.userId, bookingId: early, accept: true },
      new Date(MON_19.getTime() - HOUR),
    );
    expect(
      await db.booking.findUniqueOrThrow({ where: { id: early } }),
    ).toMatchObject({ status: "CANCELED", deducted: false });

    // 11/18 19시 수업: 10시간 전 요청 → 당일 취소 1회 차감
    const lateStart = kstDateTime(2026, 11, 18, 19);
    await requestCancelByStudent(
      db,
      { userId: s.student.userId, bookingId: late },
      new Date(lateStart.getTime() - 10 * HOUR),
    );
    await respondCancelRequest(
      db,
      { trainerId: s.trainer.userId, bookingId: late, accept: true },
      new Date(lateStart.getTime() - 9 * HOUR),
    );
    expect(
      await db.booking.findUniqueOrThrow({ where: { id: late } }),
    ).toMatchObject({
      status: "CANCELED",
      deducted: true,
      deductReason: "LATE_CANCEL",
      passId: s.pass.id,
    });
    expect(await getAvailableCount(db, s.studentId, "2026-11-20")).toBe(9);
  });

  it("규칙 미동의 수강생은 당일 취소를 기록만 하고 차감하지 않음", async () => {
    const s = await setup({ agree: false });
    const id = (await trainerBook(s, MON_19)).created[0];
    await respondConfirmRequest(
      db,
      { userId: s.student.userId, bookingId: id, accept: true },
      T0,
    );
    await requestCancelByStudent(
      db,
      { userId: s.student.userId, bookingId: id },
      new Date(MON_19.getTime() - 2 * HOUR),
    );
    await respondCancelRequest(
      db,
      { trainerId: s.trainer.userId, bookingId: id, accept: true },
      new Date(MON_19.getTime() - HOUR),
    );
    expect(await db.booking.findUniqueOrThrow({ where: { id } })).toMatchObject(
      { deducted: false, deductSkippedReason: "NO_CONSENT" },
    );
  });

  it("거절하면 예약 유지, 트레이너 무응답이면 수업 시작에 자동 취소(요청 시각 기준)", async () => {
    const s = await setup();
    const id = (await trainerBook(s, MON_19)).created[0];
    await respondConfirmRequest(
      db,
      { userId: s.student.userId, bookingId: id, accept: true },
      T0,
    );
    await requestCancelByStudent(
      db,
      { userId: s.student.userId, bookingId: id },
      T0,
    );
    await respondCancelRequest(
      db,
      {
        trainerId: s.trainer.userId,
        bookingId: id,
        accept: false,
        reason: "가능합니다",
      },
      T0,
    );
    expect(await db.booking.findUniqueOrThrow({ where: { id } })).toMatchObject(
      { status: "CONFIRMED", cancelRequestedAt: null },
    );

    await requestCancelByStudent(
      db,
      { userId: s.student.userId, bookingId: id },
      new Date(MON_19.getTime() - 3 * HOUR),
    );
    const r = await runBookingJobs(db, MON_19);
    expect(r.autoCanceled).toBe(1);
    expect(await db.booking.findUniqueOrThrow({ where: { id } })).toMatchObject(
      { status: "CANCELED", deducted: true, canceledBy: "SYSTEM" },
    );
  });
});

describe("자동 처리", () => {
  it("확정 대기 무응답 → 수업 시작에 자동 확정", async () => {
    const s = await setup();
    const id = (await trainerBook(s, MON_19)).created[0];
    expect(
      (await runBookingJobs(db, new Date(MON_19.getTime() - 1))).autoConfirmed,
    ).toBe(0);
    expect((await runBookingJobs(db, MON_19)).autoConfirmed).toBe(1);
    expect(await db.booking.findUniqueOrThrow({ where: { id } })).toMatchObject(
      { status: "CONFIRMED", autoConfirmed: true },
    );
  });

  it("신청 대기 무응답 → 수업 12시간 전에 만료", async () => {
    const s = await setup();
    const b = await requestBookingByStudent(
      db,
      { userId: s.student.userId, start: MON_19 },
      T0,
    );
    expect(
      (await runBookingJobs(db, new Date(MON_19.getTime() - 12 * HOUR - 1)))
        .expired,
    ).toBe(0);
    expect(
      (await runBookingJobs(db, new Date(MON_19.getTime() - 12 * HOUR)))
        .expired,
    ).toBe(1);
    expect(await status(b.id)).toBe("EXPIRED");
  });
});

describe("잔여 부족 보류·복구·자동 취소", () => {
  it("차감으로 잔여보다 예약이 많아지면 가장 나중 예약이 잔여 부족 → 이용권 추가로 복구", async () => {
    const s = await setup({ count: 2 });
    const a = (await trainerBook(s, MON_19)).created[0];
    const b = (await trainerBook(s, kstDateTime(2026, 11, 20, 19))).created[0];
    for (const id of [a, b])
      await respondConfirmRequest(
        db,
        { userId: s.student.userId, bookingId: id, accept: true },
        T0,
      );
    // 지난 수업 노쇼 차감을 흉내 (M4에서 실제 흐름)
    await db.booking.create({
      data: {
        studentId: s.studentId,
        trainerId: s.trainer.userId,
        startAt: kstDateTime(2026, 11, 12, 19),
        endAt: kstDateTime(2026, 11, 12, 19, 50),
        source: "TRAINER",
        status: "NO_SHOW",
        deducted: true,
        deductReason: "NO_SHOW",
        passId: s.pass.id,
      },
    });
    const { reconcileInsufficient } = await import("./insufficient");
    const r = await db.$transaction((tx) =>
      reconcileInsufficient(tx, s.studentId, T0),
    );
    expect(r.marked).toEqual([b]);
    expect(
      await db.booking.findUniqueOrThrow({ where: { id: b } }),
    ).toMatchObject({ status: "INSUFFICIENT", prevStatus: "CONFIRMED" });
    expect(await status(a)).toBe("CONFIRMED");

    await createPass(
      db,
      s.trainer.userId,
      s.studentId,
      {
        name: "추가",
        count: 5,
        startDate: "2026-11-13",
        endDate: "2027-01-31",
      },
      T0,
    );
    expect(
      await db.booking.findUniqueOrThrow({ where: { id: b } }),
    ).toMatchObject({ status: "CONFIRMED", prevStatus: null });
  });

  it("환불로 잔여가 줄면 보류, 24시간 전까지 해결 안 되면 차감 없이 자동 취소", async () => {
    const s = await setup({ count: 3 });
    const id = (await trainerBook(s, MON_19)).created[0];
    await refundPass(db, s.trainer.userId, s.pass.id, T0);
    expect(await status(id)).toBe("INSUFFICIENT");
    expect(
      (await runBookingJobs(db, new Date(MON_19.getTime() - 24 * HOUR - 1)))
        .insufficientCanceled,
    ).toBe(0);
    expect(
      (await runBookingJobs(db, new Date(MON_19.getTime() - 24 * HOUR)))
        .insufficientCanceled,
    ).toBe(1);
    expect(await db.booking.findUniqueOrThrow({ where: { id } })).toMatchObject(
      { status: "CANCELED", deducted: false },
    );
  });

  it("수업 24시간 이내에 생긴 잔여 부족은 2시간 전까지 기다린다", async () => {
    const s = await setup({ count: 3 });
    const id = (await trainerBook(s, MON_19)).created[0];
    await respondConfirmRequest(
      db,
      { userId: s.student.userId, bookingId: id, accept: true },
      T0,
    );
    await refundPass(
      db,
      s.trainer.userId,
      s.pass.id,
      new Date(MON_19.getTime() - 10 * HOUR),
    );
    expect(await status(id)).toBe("INSUFFICIENT");
    expect(
      (await runBookingJobs(db, new Date(MON_19.getTime() - 3 * HOUR)))
        .insufficientCanceled,
    ).toBe(0);
    expect(
      (await runBookingJobs(db, new Date(MON_19.getTime() - 2 * HOUR)))
        .insufficientCanceled,
    ).toBe(1);
  });
});

describe("권한", () => {
  it("다른 트레이너·다른 수강생의 예약은 다룰 수 없다", async () => {
    const s = await setup();
    const id = (await trainerBook(s, MON_19)).created[0];
    const t2 = await makeUser("TRAINER");
    const st2 = await makeUser("STUDENT");
    await expectAppError(
      cancelByTrainer(db, { trainerId: t2.userId, bookingId: id }, T0),
      "NOT_FOUND",
    );
    await expectAppError(
      respondConfirmRequest(
        db,
        { userId: st2.userId, bookingId: id, accept: true },
        T0,
      ),
      "NOT_FOUND",
    );
    await expectAppError(
      createBookingsByTrainer(
        db,
        {
          trainerId: t2.userId,
          studentId: s.studentId,
          start: MON_19,
          acknowledgeWarnings: true,
        },
        T0,
      ),
      "NOT_FOUND",
    );
  });
});
