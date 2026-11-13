import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { kstDateTime } from "@/lib/time";
import { AppError } from "@/server/errors";
import { login } from "@/server/auth/login-service";
import { isLoginIdAvailable } from "@/server/auth/signup-service";
import {
  approveWithPin,
  runApprovalJobs,
} from "@/server/bookings/approval-service";
import {
  createBookingsByTrainer,
  respondConfirmRequest,
} from "@/server/bookings/booking-service";
import {
  getStudentCalendar,
  getTrainerCalendar,
} from "@/server/bookings/calendar-service";
import { createCenterForTrainer } from "@/server/center/center-service";
import { runCenterJobs } from "@/server/center/departure-service";
import { createPass } from "@/server/passes/pass-service";
import { respondRuleConsent } from "@/server/rules/rule-service";
import {
  getStudentStatsDetail,
  getTrainerStats,
} from "@/server/stats/stats-service";
import { respondLinkRequest } from "@/server/students/student-service";
import { resetDb, seedTerms, testDb } from "@/test/db-helpers";
import { T0, makeUser, resetFactorySeq } from "@/test/factories";
import {
  cancelWithdraw,
  deleteWithdrawnUsers,
  requestWithdraw,
  withdrawPreview,
} from "./withdraw-service";

const db = testDb();
const DAY = 86400_000;
async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy(
    (e: unknown) => e instanceof AppError && e.code === code,
  );
}

/** 트레이너 + 수강생, 완료 수업 1회 + 예정 수업 1회 */
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
    { name: "PT", count: 10, startDate: "2026-11-01", endDate: "2027-03-31" },
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
  const mk = async (start: Date) => {
    const r = await createBookingsByTrainer(
      db,
      {
        trainerId: trainer.userId,
        studentId,
        start,
        acknowledgeWarnings: true,
      },
      T0,
    );
    if (r.needsConfirmation) throw new Error();
    await respondConfirmRequest(
      db,
      { userId: student.userId, bookingId: r.created[0], accept: true },
      T0,
    );
    return r.created[0];
  };
  const done = await mk(kstDateTime(2026, 11, 14, 19));
  await runApprovalJobs(db, kstDateTime(2026, 11, 14, 20));
  await approveWithPin(
    db,
    {
      method: "PIN_APP",
      studentUserId: student.userId,
      bookingId: done,
      pin: "1357",
    },
    kstDateTime(2026, 11, 14, 20),
  );
  const upcoming = await mk(kstDateTime(2026, 11, 20, 19));
  return { trainer, student, studentId, done, upcoming };
}

const NOW = kstDateTime(2026, 11, 15, 10);

beforeEach(async () => {
  await resetDb(db);
  await seedTerms(db);
  resetFactorySeq();
});
afterAll(async () => db.$disconnect());

describe("탈퇴 신청", () => {
  it("계정 정지, 예정 예약 차감 없이 취소, 상대방에게 탈퇴 예정 알림, 안내 문구", async () => {
    const s = await setup();
    const p = await withdrawPreview(db, s.student.userId, NOW);
    expect(p).toMatchObject({ remainingPasses: 1, upcomingBookings: 1 });
    await expectAppError(
      requestWithdraw(db, { userId: s.student.userId, password: "wrong" }, NOW),
      "WRONG_PASSWORD",
    );
    const r = await requestWithdraw(
      db,
      {
        userId: s.student.userId,
        password: s.student.password,
        reason: "이사",
      },
      NOW,
    );
    expect(r.message).toContain("삭제 예정일: 11월 20일");
    expect(
      await db.user.findUniqueOrThrow({ where: { id: s.student.userId } }),
    ).toMatchObject({ status: "WITHDRAWING" });
    expect(
      await db.booking.findUniqueOrThrow({ where: { id: s.upcoming } }),
    ).toMatchObject({ status: "CANCELED", deducted: false });
    expect(
      await db.notification.count({
        where: { userId: s.trainer.userId, type: "WITHDRAW_NOTICE" },
      }),
    ).toBe(1);
    expect(
      await db.notification.findFirstOrThrow({
        where: { type: "DELETE_TOMORROW" },
      }),
    ).toMatchObject({ sendAt: kstDateTime(2026, 11, 19, 10) });
    // 모든 기기 로그아웃, 다시 로그인은 되지만(취소 화면) 계정은 정지
    expect(
      await db.session.count({
        where: { userId: s.student.userId, revokedAt: null },
      }),
    ).toBe(0);
    await login(
      db,
      {
        role: "STUDENT",
        loginId: s.student.loginId,
        password: s.student.password,
        remember: false,
        deviceLabel: "x",
      },
      NOW,
    );
  });

  it("5일 안에 취소, 취소된 예약은 복구되지 않음", async () => {
    const s = await setup();
    await requestWithdraw(
      db,
      { userId: s.student.userId, password: s.student.password },
      NOW,
    );
    await cancelWithdraw(
      db,
      s.student.userId,
      new Date(NOW.getTime() + 4 * DAY),
    );
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: s.student.userId } }))
        .status,
    ).toBe("ACTIVE");
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: s.upcoming } }))
        .status,
    ).toBe("CANCELED");
    expect(
      (await deleteWithdrawnUsers(db, new Date(NOW.getTime() + 6 * DAY)))
        .usersDeleted,
    ).toBe(0);
  });

  it("마지막 센터 관리자는 다른 관리자 지정 또는 해산 전에는 탈퇴 불가", async () => {
    const t = await makeUser("TRAINER");
    await createCenterForTrainer(
      db,
      t.userId,
      { name: "센터", address: "서울", phone: "0212345678" },
      T0,
    );
    await expectAppError(
      requestWithdraw(db, { userId: t.userId, password: t.password }, NOW),
      "LAST_ADMIN",
    );
  });
});

describe("완료 기준: 삭제 후 상대방 화면", () => {
  it("수강생 삭제 → 트레이너 화면에는 '탈퇴 회원'으로 수업 횟수만", async () => {
    const s = await setup();
    await requestWithdraw(
      db,
      { userId: s.student.userId, password: s.student.password },
      NOW,
    );
    expect(
      (await deleteWithdrawnUsers(db, new Date(NOW.getTime() + 5 * DAY)))
        .usersDeleted,
    ).toBe(1);

    const stats = await getTrainerStats(
      db,
      s.trainer.userId,
      "2026-11-01",
      "2026-11-30",
      kstDateTime(2026, 11, 21),
    );
    expect(stats.rows).toEqual([
      expect.objectContaining({ name: "탈퇴 회원", completed: 1 }),
    ]);
    const cal = await getTrainerCalendar(
      db,
      s.trainer.userId,
      "2026-11-09",
      "2026-11-22",
      kstDateTime(2026, 11, 21),
    );
    expect(cal.bookings.map((b) => b.studentName)).toEqual([
      "탈퇴 회원",
      "탈퇴 회원",
    ]);
    const detail = await getStudentStatsDetail(
      db,
      s.trainer.userId,
      s.studentId,
      "2026-11-01",
      "2026-11-30",
    );
    expect(detail.studentName).toBe("탈퇴 회원");
    // 개인정보와 본인 기록 삭제
    const st = await db.student.findUniqueOrThrow({
      where: { id: s.studentId },
    });
    expect(st).toMatchObject({ name: "탈퇴 회원", phone: "", userId: null });
    expect(await db.pass.count({ where: { studentId: s.studentId } })).toBe(0);
    expect(
      await db.ruleConsent.count({ where: { studentId: s.studentId } }),
    ).toBe(0);
    const u = await db.user.findUniqueOrThrow({
      where: { id: s.student.userId },
    });
    expect(u).toMatchObject({
      status: "DELETED",
      name: "탈퇴 회원",
      birthDate: null,
    });
    expect(u.loginId).not.toContain(s.student.loginId);
    expect(
      JSON.stringify(
        await db.auditLog.findMany({
          where: { entity: "User", entityId: s.student.userId },
        }),
      ),
    ).not.toContain(s.student.loginId);
    // 상대방 휴대폰 백업 삭제 신호
    expect(
      await db.deletionTombstone.count({
        where: { entity: "Student", entityId: s.studentId },
      }),
    ).toBe(1);
    // 같은 아이디로 재가입 불가, 로그인 불가
    expect(await isLoginIdAvailable(db, s.student.loginId)).toBe(false);
    await expectAppError(
      login(
        db,
        {
          role: "STUDENT",
          loginId: s.student.loginId,
          password: s.student.password,
          remember: false,
          deviceLabel: "x",
        },
        NOW,
      ),
      "LOGIN_FAILED",
    );
  });

  it("트레이너 삭제 → 수강생 이력의 수업은 남고 '탈퇴 트레이너', 수강생은 선택대로", async () => {
    const s = await setup();
    await requestWithdraw(
      db,
      { userId: s.trainer.userId, password: s.trainer.password },
      NOW,
    );
    // 개인 트레이너: 무응답이면 "담당 트레이너 없음"
    const at = new Date(NOW.getTime() + 5 * DAY);
    await runCenterJobs(db, at);
    await deleteWithdrawnUsers(db, at);
    const st = await db.student.findUniqueOrThrow({
      where: { id: s.studentId },
    });
    expect(st.currentTrainerId).toBeNull();
    const cal = await getStudentCalendar(
      db,
      s.student.userId,
      "2026-11-09",
      "2026-11-22",
      kstDateTime(2026, 11, 21),
    );
    expect(cal.bookings.find((b) => b.id === s.done)).toMatchObject({
      trainerName: "탈퇴 트레이너",
      status: "COMPLETED",
    });
    // 이용권·이력 유지
    expect(await db.pass.count({ where: { studentId: s.studentId } })).toBe(1);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: s.trainer.userId } }))
        .status,
    ).toBe("DELETED");
    expect(await isLoginIdAvailable(db, s.trainer.loginId)).toBe(false);
  });
});
