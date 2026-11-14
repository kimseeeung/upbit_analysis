import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isNight } from "@/lib/notify/night";
import { kstDateTime } from "@/lib/time";
import {
  cancelByTrainer,
  createBookingsByTrainer,
  respondConfirmRequest,
} from "@/server/bookings/booking-service";
import { createPass } from "@/server/passes/pass-service";
import { respondRuleConsent } from "@/server/rules/rule-service";
import {
  registerTemporaryStudent,
  respondLinkRequest,
} from "@/server/students/student-service";
import { resetDb, seedTerms, testDb } from "@/test/db-helpers";
import { T0, makeUser, resetFactorySeq } from "@/test/factories";
import {
  deliverDueNotifications,
  markNotificationConfirmed,
} from "./notify-service";
import { scheduleReminders } from "./reminders";

// 야간 발송 제한을 켠 상태의 규칙 검사 (기본은 꺼짐)
vi.stubEnv("NEXT_PUBLIC_NOTIFY_QUIET_HOURS", "1");

const db = testDb();
const MIN = 60_000;

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
    { name: "PT", count: 20, startDate: "2026-11-01", endDate: "2027-01-31" },
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
  await db.pushSubscription.create({
    data: {
      userId: student.userId,
      endpoint: `https://push.example/${student.userId}`,
      p256dh: "k",
      auth: "a",
    },
  });
  await db.pushSubscription.create({
    data: {
      userId: trainer.userId,
      endpoint: `https://push.example/${trainer.userId}`,
      p256dh: "k",
      auth: "a",
    },
  });
  return { trainer, student, studentId };
}

async function book(
  trainerId: string,
  studentId: string,
  start: Date,
  confirmBy?: string,
) {
  const r = await createBookingsByTrainer(
    db,
    { trainerId, studentId, start, acknowledgeWarnings: true },
    T0,
  );
  if (r.needsConfirmation) throw new Error();
  if (confirmBy)
    await respondConfirmRequest(
      db,
      { userId: confirmBy, bookingId: r.created[0], accept: true },
      T0,
    );
  return r.created[0];
}

/** from부터 to까지 step분마다 1분 작업을 돌린다 */
async function simulate(from: Date, to: Date, stepMin = 10) {
  for (let t = from.getTime(); t <= to.getTime(); t += stepMin * MIN) {
    const now = new Date(t);
    await scheduleReminders(db, now);
    await deliverDueNotifications(db, now);
  }
}

beforeEach(async () => {
  await resetDb(db);
  await seedTerms(db);
  resetFactorySeq();
});
afterAll(async () => db.$disconnect());

describe("완료 기준: 21:00~08:00 발송 0건", () => {
  it("이틀 동안 10분마다 돌려도 야간에 보낸 알림이 없다", async () => {
    const s = await setup();
    // 11/17(화) 08:30, 12:00, 22:30 / 11/18(수) 07:00(트레이너 근무 외지만 등록) 수업
    const times = [
      kstDateTime(2026, 11, 17, 8, 30),
      kstDateTime(2026, 11, 17, 12, 0),
      kstDateTime(2026, 11, 17, 22, 30),
      kstDateTime(2026, 11, 18, 7, 0),
    ];
    for (const t of times)
      await book(s.trainer.userId, s.studentId, t, s.student.userId);
    await simulate(
      kstDateTime(2026, 11, 15, 12, 0),
      kstDateTime(2026, 11, 18, 12, 0),
    );

    const sent = await db.notification.findMany({ where: { status: "SENT" } });
    expect(sent.length).toBeGreaterThan(0);
    for (const n of sent)
      expect(isNight(n.sentAt!), `${n.type} ${n.sentAt!.toISOString()}`).toBe(
        false,
      );
    // 트레이너 확정 요청·수락 알림 등도 야간에 만들어지면 08:00으로 미뤄진다
    const all = await db.notification.findMany({
      where: { status: { in: ["SENT", "SCHEDULED"] } },
    });
    for (const n of all) expect(isNight(n.sendAt)).toBe(false);
  });

  it("야간에 생긴 즉시 알림(예: 확정 요청)은 08:00에 나간다", async () => {
    const s = await setup();
    const night = kstDateTime(2026, 11, 16, 23, 0);
    const r = await createBookingsByTrainer(
      db,
      {
        trainerId: s.trainer.userId,
        studentId: s.studentId,
        start: kstDateTime(2026, 11, 20, 19),
        acknowledgeWarnings: true,
      },
      night,
    );
    if (r.needsConfirmation) throw new Error();
    const n = await db.notification.findFirstOrThrow({
      where: { type: "CONFIRM_REQUEST" },
    });
    expect(n.sendAt).toEqual(kstDateTime(2026, 11, 17, 8, 0));
    expect(
      (await deliverDueNotifications(db, kstDateTime(2026, 11, 17, 7, 59)))
        .sent,
    ).toBe(0);
    expect(
      (await deliverDueNotifications(db, kstDateTime(2026, 11, 17, 8, 0))).sent,
    ).toBeGreaterThan(0);
  });
});

describe("완료 기준: 08시대 수업 2시간 전 알림 생략", () => {
  it("08:00·08:30·08:59 수업은 2시간 전 알림을 보내지 않고 생략 기록을 남긴다", async () => {
    const s = await setup();
    const ids = [];
    // 같은 시간대가 겹치지 않게 날을 나눈다 (11/17, 11/19, 11/20)
    for (const [d, m] of [
      [17, 0],
      [19, 30],
      [20, 59],
    ]) {
      ids.push(
        await book(
          s.trainer.userId,
          s.studentId,
          kstDateTime(2026, 11, d, 8, m),
          s.student.userId,
        ),
      );
    }
    const nine = await book(
      s.trainer.userId,
      s.studentId,
      kstDateTime(2026, 11, 18, 9, 0),
      s.student.userId,
    );
    await simulate(
      kstDateTime(2026, 11, 15, 12, 0),
      kstDateTime(2026, 11, 21, 9, 0),
      20,
    );
    for (const id of ids) {
      const two = await db.notification.findFirstOrThrow({
        where: { bookingId: id, type: "TWO_HOURS" },
      });
      expect(two).toMatchObject({
        status: "SKIPPED",
        failReason: "TOO_LATE_AFTER_NIGHT",
        sentAt: null,
      });
    }
    // 09:00 수업은 08:00에 보낸다
    const two9 = await db.notification.findFirstOrThrow({
      where: { bookingId: nine, type: "TWO_HOURS" },
    });
    expect(two9).toMatchObject({
      status: "SENT",
      sentAt: kstDateTime(2026, 11, 18, 8, 0),
    });
  });
});

describe("전일·2시간 전 알림", () => {
  it("트레이너가 정한 전일 시각에, 확정 대기면 수락 안내", async () => {
    const s = await setup();
    await db.trainerProfile.update({
      where: { userId: s.trainer.userId },
      data: { dayBeforeNotifyTime: "19:30" },
    });
    const id = await book(
      s.trainer.userId,
      s.studentId,
      kstDateTime(2026, 11, 17, 19),
    );
    await simulate(
      kstDateTime(2026, 11, 16, 19, 0),
      kstDateTime(2026, 11, 16, 20, 0),
    );
    const n = await db.notification.findFirstOrThrow({
      where: { bookingId: id, type: "DAY_BEFORE" },
    });
    expect(n).toMatchObject({
      status: "SENT",
      sentAt: kstDateTime(2026, 11, 16, 19, 30),
    });
    expect(n.body).toContain("수락");
    expect(
      await markNotificationConfirmed(
        db,
        s.student.userId,
        n.id,
        kstDateTime(2026, 11, 16, 19, 40),
      ),
    ).toBe(true);
    // 다른 사람은 확인 처리할 수 없다
    expect(await markNotificationConfirmed(db, s.trainer.userId, n.id)).toBe(
      false,
    );
  });

  it("수강생별·예약별로 끌 수 있다", async () => {
    const s = await setup();
    const a = await book(
      s.trainer.userId,
      s.studentId,
      kstDateTime(2026, 11, 17, 19),
      s.student.userId,
    );
    const b = await book(
      s.trainer.userId,
      s.studentId,
      kstDateTime(2026, 11, 18, 19),
      s.student.userId,
    );
    await db.booking.update({ where: { id: b }, data: { notify2hOff: true } });
    await db.trainerStudentLink.updateMany({
      where: { studentId: s.studentId },
      data: { notifyDayBefore: false },
    });
    await scheduleReminders(db, kstDateTime(2026, 11, 15, 12));
    expect(await db.notification.count({ where: { type: "DAY_BEFORE" } })).toBe(
      0,
    );
    expect(
      await db.notification.count({
        where: { bookingId: a, type: "TWO_HOURS" },
      }),
    ).toBe(1);
    expect(
      await db.notification.count({
        where: { bookingId: b, type: "TWO_HOURS" },
      }),
    ).toBe(0);
  });

  it("취소된 예약에는 수업 알림을 보내지 않는다", async () => {
    const s = await setup();
    const id = await book(
      s.trainer.userId,
      s.studentId,
      kstDateTime(2026, 11, 17, 19),
      s.student.userId,
    );
    await scheduleReminders(db, kstDateTime(2026, 11, 15, 12));
    expect(
      await db.notification.count({
        where: {
          bookingId: id,
          type: { in: ["DAY_BEFORE", "TWO_HOURS"] },
          status: "SCHEDULED",
        },
      }),
    ).toBe(2);
    await cancelByTrainer(
      db,
      { trainerId: s.trainer.userId, bookingId: id },
      kstDateTime(2026, 11, 15, 13),
    );
    await simulate(
      kstDateTime(2026, 11, 16, 8),
      kstDateTime(2026, 11, 17, 19),
      30,
    );
    expect(
      await db.notification.count({
        where: {
          bookingId: id,
          type: { in: ["DAY_BEFORE", "TWO_HOURS"] },
          status: "SENT",
        },
      }),
    ).toBe(0);
  });

  it("당일에 잡아 전일 알림 시각이 지났으면 보내지 않는다", async () => {
    const s = await setup();
    const sameDay = kstDateTime(2026, 11, 17, 19);
    const r = await createBookingsByTrainer(
      db,
      {
        trainerId: s.trainer.userId,
        studentId: s.studentId,
        start: sameDay,
        acknowledgeWarnings: true,
      },
      kstDateTime(2026, 11, 17, 10),
    );
    if (r.needsConfirmation) throw new Error();
    await scheduleReminders(db, kstDateTime(2026, 11, 17, 10, 1));
    expect(
      await db.notification.findFirstOrThrow({
        where: { bookingId: r.created[0], type: "DAY_BEFORE" },
      }),
    ).toMatchObject({
      status: "SKIPPED",
      failReason: "PAST",
    });
  });
});

describe("알림 못 받는 수강생", () => {
  it("미가입 수강생: 직접 보내야 함 표시 + 트레이너에게 하루 한 번 묶어서", async () => {
    const trainer = await makeUser("TRAINER");
    await db.pushSubscription.create({
      data: {
        userId: trainer.userId,
        endpoint: "https://push.example/t",
        p256dh: "k",
        auth: "a",
      },
    });
    for (const [i, phone] of ["01033330001", "01033330002"].entries()) {
      const st = await registerTemporaryStudent(
        db,
        trainer.userId,
        { name: `미가입${i}`, phone },
        T0,
      );
      await createPass(
        db,
        trainer.userId,
        st.id,
        {
          name: "PT",
          count: 5,
          startDate: "2026-11-01",
          endDate: "2027-01-31",
        },
        T0,
      );
      await book(trainer.userId, st.id, kstDateTime(2026, 11, 17, 18 + i));
    }
    await scheduleReminders(db, kstDateTime(2026, 11, 15, 12));
    const confirm = await db.notification.findMany({
      where: { type: "CONFIRM_REQUEST" },
    });
    expect(confirm.every((n) => n.needsManualShare)).toBe(true);
    const digest = await db.notification.findFirstOrThrow({
      where: { type: "MANUAL_SHARE_DIGEST" },
    });
    expect(digest).toMatchObject({
      userId: trainer.userId,
      body: "카톡으로 보낼 수강생 2명",
      sendAt: kstDateTime(2026, 11, 16, 20),
    });
    await deliverDueNotifications(db, kstDateTime(2026, 11, 16, 20));
    expect(
      await db.notification.count({
        where: {
          type: "DAY_BEFORE",
          status: "FAILED",
          failReason: "NO_ACCOUNT",
        },
      }),
    ).toBe(2);
  });

  it("구독이 끊긴 기기는 지우고 실패로 기록", async () => {
    const s = await setup();
    await db.pushSubscription.updateMany({
      where: { userId: s.student.userId },
      data: { endpoint: "https://push.example/gone" },
    });
    await book(s.trainer.userId, s.studentId, kstDateTime(2026, 11, 20, 19));
    await deliverDueNotifications(db, kstDateTime(2026, 11, 13, 12));
    expect(
      await db.pushSubscription.count({ where: { userId: s.student.userId } }),
    ).toBe(0);
    expect(
      await db.notification.findFirstOrThrow({
        where: { type: "CONFIRM_REQUEST" },
      }),
    ).toMatchObject({ status: "FAILED" });
  });
});

describe("이벤트 알림", () => {
  it("확정 요청 → 수락 결과 → 변경·취소 알림이 기록된다", async () => {
    const s = await setup();
    const id = await book(
      s.trainer.userId,
      s.studentId,
      kstDateTime(2026, 11, 20, 19),
      s.student.userId,
    );
    await cancelByTrainer(
      db,
      { trainerId: s.trainer.userId, bookingId: id },
      T0,
    );
    const types = (
      await db.notification.findMany({
        where: { bookingId: id },
        orderBy: { createdAt: "asc" },
      })
    ).map((n) => [n.type, n.userId]);
    expect(types.sort()).toEqual(
      [
        ["CONFIRM_REQUEST", s.student.userId],
        ["CONFIRM_RESULT", s.trainer.userId],
        ["CANCELED_BY_TRAINER", s.student.userId],
      ].sort(),
    );
  });
});
