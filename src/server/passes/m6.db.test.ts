import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { kstDateTime, toKstDateKey } from "@/lib/time";
import { AppError } from "@/server/errors";
import {
  approveWithPin,
  markNoShow,
  runApprovalJobs,
} from "@/server/bookings/approval-service";
import {
  createBookingsByTrainer,
  respondConfirmRequest,
} from "@/server/bookings/booking-service";
import { respondRuleConsent } from "@/server/rules/rule-service";
import {
  getStudentStatsDetail,
  getTrainerStats,
} from "@/server/stats/stats-service";
import { respondLinkRequest } from "@/server/students/student-service";
import { resetDb, seedTerms, testDb } from "@/test/db-helpers";
import { T0, makeUser, resetFactorySeq } from "@/test/factories";
import { getAvailableCount } from "./availability-service";
import { createPass } from "./pass-service";
import {
  requestPause,
  respondPause,
  resumeEarly,
  syncPauseStatuses,
} from "./pause-service";

const db = testDb();
async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy(
    (e: unknown) => e instanceof AppError && e.code === code,
  );
}

async function setup() {
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
      name: "PT 20",
      count: 20,
      startDate: "2026-11-01",
      endDate: "2027-01-31",
    },
    T0,
  );
  const c = await db.ruleConsent.findFirstOrThrow({
    where: { passId: pass.id },
  });
  await respondRuleConsent(
    db,
    { studentUserId: student.userId, consentId: c.id, action: "AGREE" },
    T0,
  );
  return { trainer, student, studentId, pass };
}

const tActor = (id: string) => ({ role: "TRAINER" as const, userId: id });
const sActor = (id: string) => ({ role: "STUDENT" as const, userId: id });

beforeEach(async () => {
  await resetDb(db);
  await seedTerms(db);
  resetFactorySeq();
});
afterAll(async () => db.$disconnect());

describe("일시정지", () => {
  it("수강생 요청 → 트레이너 승인: 만료일 연장, 기간 안 예약은 차감 없이 취소, 정지 기간 예약 불가", async () => {
    const s = await setup();
    const r = await createBookingsByTrainer(
      db,
      {
        trainerId: s.trainer.userId,
        studentId: s.studentId,
        start: kstDateTime(2026, 12, 3, 19),
        acknowledgeWarnings: true,
      },
      T0,
    );
    if (r.needsConfirmation) throw new Error();
    const p = await requestPause(
      db,
      {
        actor: sActor(s.student.userId),
        passId: s.pass.id,
        startDate: "2026-12-01",
        endDate: "2026-12-10",
        reason: "여행",
      },
      T0,
    );
    // 요청한 쪽은 승인할 수 없다
    await expectAppError(
      respondPause(
        db,
        { actor: sActor(s.student.userId), pauseId: p.id, approve: true },
        T0,
      ),
      "FORBIDDEN",
    );
    await respondPause(
      db,
      { actor: tActor(s.trainer.userId), pauseId: p.id, approve: true },
      T0,
    );

    const pass = await db.pass.findUniqueOrThrow({ where: { id: s.pass.id } });
    expect(toKstDateKey(pass.endDate)).toBe("2027-02-10");
    expect(
      await db.booking.findUniqueOrThrow({ where: { id: r.created[0] } }),
    ).toMatchObject({
      status: "CANCELED",
      deducted: false,
      cancelReason: "일시정지",
    });
    expect(await getAvailableCount(db, s.studentId, "2026-12-05")).toBe(0);
    expect(await getAvailableCount(db, s.studentId, "2026-12-11")).toBe(20);
    expect(await getAvailableCount(db, s.studentId, "2027-02-10")).toBe(20);
    await expectAppError(
      createBookingsByTrainer(
        db,
        {
          trainerId: s.trainer.userId,
          studentId: s.studentId,
          start: kstDateTime(2026, 12, 5, 19),
          acknowledgeWarnings: true,
        },
        T0,
      ),
      "NO_REMAINING",
    );
    expect(
      await db.notification.count({ where: { type: "PAUSE_NOTICE" } }),
    ).toBe(4);
  });

  it("정지 기간이 되면 상태가 일시정지, 끝나면 사용 중", async () => {
    const s = await setup();
    const p = await requestPause(
      db,
      {
        actor: tActor(s.trainer.userId),
        passId: s.pass.id,
        startDate: "2026-12-01",
        endDate: "2026-12-10",
        reason: "부상",
      },
      T0,
    );
    await respondPause(
      db,
      { actor: sActor(s.student.userId), pauseId: p.id, approve: true },
      T0,
    );
    await syncPauseStatuses(db, kstDateTime(2026, 12, 1, 0, 5));
    expect(
      (await db.pass.findUniqueOrThrow({ where: { id: s.pass.id } })).status,
    ).toBe("PAUSED");
    await syncPauseStatuses(db, kstDateTime(2026, 12, 11, 0, 5));
    expect(
      (await db.pass.findUniqueOrThrow({ where: { id: s.pass.id } })).status,
    ).toBe("ACTIVE");
  });

  it("조기 재개: 실제로 쉰 일수만 연장", async () => {
    const s = await setup();
    const p = await requestPause(
      db,
      {
        actor: sActor(s.student.userId),
        passId: s.pass.id,
        startDate: "2026-12-01",
        endDate: "2026-12-10",
        reason: "여행",
      },
      T0,
    );
    await respondPause(
      db,
      { actor: tActor(s.trainer.userId), pauseId: p.id, approve: true },
      T0,
    );
    const r = await resumeEarly(
      db,
      { actor: sActor(s.student.userId), pauseId: p.id },
      kstDateTime(2026, 12, 5, 9),
    );
    expect(r).toMatchObject({ restedDays: 4, newPassEndDate: "2027-02-04" });
    expect(
      toKstDateKey(
        (await db.pass.findUniqueOrThrow({ where: { id: s.pass.id } })).endDate,
      ),
    ).toBe("2027-02-04");
    expect(await getAvailableCount(db, s.studentId, "2026-12-04")).toBe(0);
    expect(await getAvailableCount(db, s.studentId, "2026-12-05")).toBe(20);
  });

  it("한도: 1회 최대 30일, 이용권당 2회, 대기 중 요청은 하나", async () => {
    const s = await setup();
    await expectAppError(
      requestPause(
        db,
        {
          actor: sActor(s.student.userId),
          passId: s.pass.id,
          startDate: "2026-12-01",
          endDate: "2026-12-31",
          reason: "x",
        },
        T0,
      ),
      "INVALID",
    );
    const a = await requestPause(
      db,
      {
        actor: sActor(s.student.userId),
        passId: s.pass.id,
        startDate: "2026-12-01",
        endDate: "2026-12-02",
        reason: "x",
      },
      T0,
    );
    await expectAppError(
      requestPause(
        db,
        {
          actor: sActor(s.student.userId),
          passId: s.pass.id,
          startDate: "2026-12-05",
          endDate: "2026-12-06",
          reason: "x",
        },
        T0,
      ),
      "PENDING_EXISTS",
    );
    await respondPause(
      db,
      { actor: tActor(s.trainer.userId), pauseId: a.id, approve: true },
      T0,
    );
    const b = await requestPause(
      db,
      {
        actor: sActor(s.student.userId),
        passId: s.pass.id,
        startDate: "2026-12-10",
        endDate: "2026-12-11",
        reason: "x",
      },
      T0,
    );
    await respondPause(
      db,
      { actor: tActor(s.trainer.userId), pauseId: b.id, approve: true },
      T0,
    );
    await expectAppError(
      requestPause(
        db,
        {
          actor: sActor(s.student.userId),
          passId: s.pass.id,
          startDate: "2026-12-20",
          endDate: "2026-12-21",
          reason: "x",
        },
        T0,
      ),
      "INVALID",
    );
  });

  it("다른 수강생·트레이너는 다룰 수 없다", async () => {
    const s = await setup();
    const other = await makeUser("TRAINER");
    await expectAppError(
      requestPause(
        db,
        {
          actor: tActor(other.userId),
          passId: s.pass.id,
          startDate: "2026-12-01",
          endDate: "2026-12-02",
          reason: "x",
        },
        T0,
      ),
      "NOT_FOUND",
    );
  });
});

describe("수강 현황 (DB)", () => {
  it("완료·노쇼·당일 취소·승인 대기와 잔여, 요약", async () => {
    const s = await setup();
    const mk = async (d: number) => {
      const r = await createBookingsByTrainer(
        db,
        {
          trainerId: s.trainer.userId,
          studentId: s.studentId,
          start: kstDateTime(2026, 11, d, 19),
          acknowledgeWarnings: true,
        },
        T0,
      );
      if (r.needsConfirmation) throw new Error();
      await respondConfirmRequest(
        db,
        { userId: s.student.userId, bookingId: r.created[0], accept: true },
        T0,
      );
      return r.created[0];
    };
    const a = await mk(16);
    const b = await mk(17);
    await mk(18);
    await markNoShow(
      db,
      { trainerId: s.trainer.userId, bookingId: b },
      kstDateTime(2026, 11, 17, 21),
    );
    await runApprovalJobs(db, kstDateTime(2026, 11, 18, 20));
    await approveWithPin(
      db,
      {
        method: "PIN_APP",
        studentUserId: s.student.userId,
        bookingId: a,
        pin: "1357",
      },
      kstDateTime(2026, 11, 18, 20),
    );
    const { rows, summary } = await getTrainerStats(
      db,
      s.trainer.userId,
      "2026-11-01",
      "2026-11-30",
      kstDateTime(2026, 11, 18, 21),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      totalPt: 20,
      completed: 1,
      noShow: 1,
      pendingApproval: 1,
      remaining: 18,
      expiry: "2027-01-31",
      isCurrent: true,
    });
    expect(summary).toMatchObject({ totalClasses: 1, noShowRate: 0.5 });

    const detail = await getStudentStatsDetail(
      db,
      s.trainer.userId,
      s.studentId,
      "2026-11-01",
      "2026-11-30",
    );
    expect(detail.current).toBe(true);
    expect(detail.groups.flatMap((g) => g.items)).toHaveLength(3);

    // 관계없는 트레이너는 볼 수 없다
    const other = await makeUser("TRAINER");
    await expectAppError(
      getStudentStatsDetail(
        db,
        other.userId,
        s.studentId,
        "2026-11-01",
        "2026-11-30",
      ),
      "NOT_FOUND",
    );
    expect(
      (await getTrainerStats(db, other.userId, "2026-11-01", "2026-11-30"))
        .rows,
    ).toEqual([]);
  });

  it("인계: 이전 트레이너는 자기가 진행한 수업만, 전체·잔여는 새 담당", async () => {
    const s = await setup();
    const r = await createBookingsByTrainer(
      db,
      {
        trainerId: s.trainer.userId,
        studentId: s.studentId,
        start: kstDateTime(2026, 11, 16, 19),
        acknowledgeWarnings: true,
      },
      T0,
    );
    if (r.needsConfirmation) throw new Error();
    await respondConfirmRequest(
      db,
      { userId: s.student.userId, bookingId: r.created[0], accept: true },
      T0,
    );
    await runApprovalJobs(db, kstDateTime(2026, 11, 16, 20));
    await approveWithPin(
      db,
      {
        method: "PIN_APP",
        studentUserId: s.student.userId,
        bookingId: r.created[0],
        pin: "1357",
      },
      kstDateTime(2026, 11, 16, 20),
    );
    // 11/20 인계 (M7의 인계 흐름 대신 직접 기록)
    const t2 = await makeUser("TRAINER");
    await db.trainerStudentLink.updateMany({
      where: { studentId: s.studentId, endedAt: null },
      data: { endedAt: kstDateTime(2026, 11, 20, 10), status: "ENDED" },
    });
    await db.trainerStudentLink.create({
      data: {
        trainerId: t2.userId,
        studentId: s.studentId,
        startedAt: kstDateTime(2026, 11, 20, 10),
      },
    });
    await db.student.update({
      where: { id: s.studentId },
      data: { currentTrainerId: t2.userId },
    });

    const old = (
      await getTrainerStats(
        db,
        s.trainer.userId,
        "2026-11-01",
        "2026-11-30",
        kstDateTime(2026, 11, 25),
      )
    ).rows[0];
    expect(old).toMatchObject({
      completed: 1,
      isCurrent: false,
      totalPt: null,
      remaining: null,
    });
    const now2 = (
      await getTrainerStats(
        db,
        t2.userId,
        "2026-11-01",
        "2026-11-30",
        kstDateTime(2026, 11, 25),
      )
    ).rows[0];
    expect(now2).toMatchObject({
      completed: 0,
      isCurrent: true,
      totalPt: 20,
      remaining: 19,
    });
    // 이전 트레이너 상세는 자기 수업만
    const d = await getStudentStatsDetail(
      db,
      s.trainer.userId,
      s.studentId,
      "2026-11-01",
      "2026-11-30",
    );
    expect(d.current).toBe(false);
    expect(d.groups.flatMap((g) => g.items)).toHaveLength(1);
  });
});
