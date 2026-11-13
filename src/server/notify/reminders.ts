import { planDayBeforeReminder, planTwoHourReminder } from "@/lib/notify/night";
import { allocateBookings } from "@/lib/rules/availability";
import { formatKstMonthDay, toKstDateKey, toKstTimeString } from "@/lib/time";
import type { RootDb } from "@/server/db-types";
import { loadCountInputs } from "@/server/passes/availability-service";
import {
  isPushReachable,
  queueNotification,
  recordSkipped,
} from "./notify-service";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const when = (d: Date) => `${formatKstMonthDay(d)} ${toKstTimeString(d)}`;

/**
 * 수업 전 알림과 리마인드를 만든다 (pg-boss 1분 작업에서 호출).
 * - 전일 알림: 수업 전날 트레이너가 정한 시각, 확정 대기면 "수락" 버튼
 * - 2시간 전 알림: 단순 안내 (야간이면 08:00, 1시간 전보다 늦으면 생략)
 * - 수강생별(연결)·예약별 끄기를 따른다. 취소된 예약에는 보내지 않는다
 * - 리마인드: 확정 요청(12시간 전), 신청(24시간 전), 완료 승인(24시간 미승인), 규칙 동의(24시간)
 * - 잔여 3회 이하, 만료 7일 전 (양쪽)
 * - 알림 못 받는 수강생이 있으면 전일 알림 시각에 트레이너에게 "카톡으로 보낼 수강생 n명"
 */
export async function scheduleReminders(db: RootDb, now = new Date()) {
  const out = {
    dayBefore: 0,
    twoHours: 0,
    skipped: 0,
    reminders: 0,
    passAlerts: 0,
  };
  const horizon = new Date(now.getTime() + 3 * DAY);
  const bookings = await db.booking.findMany({
    where: {
      status: { in: ["CONFIRMED", "PENDING_CONFIRM"] },
      startAt: { gt: now, lte: horizon },
    },
    include: {
      student: { select: { id: true, name: true, userId: true } },
      trainer: {
        select: {
          name: true,
          trainerProfile: { select: { dayBeforeNotifyTime: true } },
        },
      },
    },
  });
  const manualByTrainerDay = new Map<
    string,
    { trainerId: string; sendAt: Date; count: number }
  >();

  for (const b of bookings) {
    const link = await db.trainerStudentLink.findFirst({
      where: { trainerId: b.trainerId, studentId: b.studentId, endedAt: null },
      select: { notifyDayBefore: true, notify2h: true },
    });
    const key = (type: string) => `${b.id}:${type}:${b.startAt.toISOString()}`;
    const reachable = await isPushReachable(db, b.student.userId);

    if (link?.notifyDayBefore !== false && !b.notifyDayBeforeOff) {
      const exists = await db.notification.findUnique({
        where: { dedupeKey: key("DAY_BEFORE") },
      });
      if (!exists) {
        const time = b.trainer.trainerProfile?.dayBeforeNotifyTime ?? "20:00";
        const plan = planDayBeforeReminder(b.startAt, time, now);
        const pending = b.status === "PENDING_CONFIRM";
        const input = {
          userId: b.student.userId,
          studentId: b.studentId,
          bookingId: b.id,
          type: "DAY_BEFORE",
          title: "내일 수업 안내",
          body: pending
            ? `내일 ${when(b.startAt)} ${b.trainer.name} 트레이너 수업이 있습니다. 확정 대기 중이니 수락해 주세요.`
            : `내일 ${when(b.startAt)} ${b.trainer.name} 트레이너 수업이 있습니다.`,
          url: "/s",
          dedupeKey: key("DAY_BEFORE"),
          responseRequired: true,
        };
        if (plan.send) {
          await queueNotification(
            db,
            { ...input, scheduledAt: plan.sendAt },
            now,
          );
          out.dayBefore += 1;
          if (!reachable) {
            const dk = `${b.trainerId}:${toKstDateKey(plan.sendAt)}`;
            const cur = manualByTrainerDay.get(dk) ?? {
              trainerId: b.trainerId,
              sendAt: plan.sendAt,
              count: 0,
            };
            cur.count += 1;
            manualByTrainerDay.set(dk, cur);
          }
        } else {
          await recordSkipped(db, { ...input, reason: plan.reason }, now);
          out.skipped += 1;
        }
      }
    }

    if (link?.notify2h !== false && !b.notify2hOff) {
      const exists = await db.notification.findUnique({
        where: { dedupeKey: key("TWO_HOURS") },
      });
      if (!exists) {
        const plan = planTwoHourReminder(b.startAt, now);
        const input = {
          userId: b.student.userId,
          studentId: b.studentId,
          bookingId: b.id,
          type: "TWO_HOURS",
          title: "수업 2시간 전",
          body: `오늘 ${toKstTimeString(b.startAt)} ${b.trainer.name} 트레이너 수업이 있습니다.`,
          url: "/s",
          dedupeKey: key("TWO_HOURS"),
        };
        if (plan.send) {
          await queueNotification(
            db,
            { ...input, scheduledAt: plan.sendAt },
            now,
          );
          out.twoHours += 1;
        } else {
          await recordSkipped(db, { ...input, reason: plan.reason }, now);
          out.skipped += 1;
        }
      }
    }
  }

  // 알림 못 받는 수강생: 트레이너에게 하루 한 번 묶어서 (전일 알림 시각)
  for (const [dk, v] of manualByTrainerDay) {
    const dedupeKey = `MANUAL_SHARE:${dk}`;
    const existing = await db.notification.findUnique({ where: { dedupeKey } });
    if (existing) {
      if (existing.status === "SCHEDULED") {
        const n = Number(/(\d+)명/.exec(existing.body)?.[1] ?? 0) + v.count;
        await db.notification.update({
          where: { id: existing.id },
          data: { body: `카톡으로 보낼 수강생 ${n}명` },
        });
      }
    } else {
      await queueNotification(
        db,
        {
          userId: v.trainerId,
          type: "MANUAL_SHARE_DIGEST",
          title: "직접 보내야 할 알림",
          body: `카톡으로 보낼 수강생 ${v.count}명`,
          url: "/t/manual-notify",
          scheduledAt: v.sendAt,
          dedupeKey,
        },
        now,
      );
    }
  }

  // 응답 리마인드 (한 번만)
  const remind = async (
    dedupeKey: string,
    input: Parameters<typeof queueNotification>[1],
  ) => {
    if (await db.notification.findUnique({ where: { dedupeKey } })) return;
    await queueNotification(db, { ...input, dedupeKey }, now);
    out.reminders += 1;
  };
  const confirmDue = await db.booking.findMany({
    where: {
      status: "PENDING_CONFIRM",
      startAt: { gt: now, lte: new Date(now.getTime() + 12 * HOUR) },
    },
    include: { student: { select: { userId: true, name: true } } },
  });
  for (const b of confirmDue) {
    await remind(`${b.id}:CONFIRM_REMIND:${b.startAt.toISOString()}`, {
      userId: b.student.userId,
      studentId: b.studentId,
      bookingId: b.id,
      type: "CONFIRM_REMIND",
      title: "예약 확정 리마인드",
      body: `${when(b.startAt)} 수업이 아직 확정 대기입니다. 수락해 주세요.`,
      url: "/s/requests",
      responseRequired: true,
    });
  }
  const requestDue = await db.booking.findMany({
    where: {
      status: "REQUESTED",
      startAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) },
    },
    include: { student: { select: { name: true } } },
  });
  for (const b of requestDue) {
    await remind(`${b.id}:REQUEST_REMIND`, {
      userId: b.trainerId,
      bookingId: b.id,
      type: "REQUEST_REMIND",
      title: "예약 신청 리마인드",
      body: `${b.student.name}님의 ${when(b.startAt)} 신청에 아직 응답하지 않았습니다.`,
      url: "/t/requests",
    });
  }
  const approvalDue = await db.booking.findMany({
    where: {
      status: "PENDING_APPROVAL",
      disputed: false,
      approvalRequestedAt: { lte: new Date(now.getTime() - 24 * HOUR) },
    },
    include: { student: { select: { userId: true } } },
  });
  for (const b of approvalDue) {
    await remind(`${b.id}:APPROVAL_REMIND`, {
      userId: b.student.userId,
      studentId: b.studentId,
      bookingId: b.id,
      type: "APPROVAL_REMIND",
      title: "수업 완료 승인 리마인드",
      body: `${when(b.startAt)} 수업 완료 승인을 기다리고 있습니다.`,
      url: "/s/requests",
      responseRequired: true,
    });
  }
  const consentDue = await db.ruleConsent.findMany({
    where: {
      status: "PENDING",
      requestedAt: { lte: new Date(now.getTime() - 24 * HOUR) },
    },
    include: {
      student: { select: { userId: true } },
      pass: { select: { name: true } },
    },
  });
  for (const c of consentDue) {
    await remind(`${c.id}:CONSENT_REMIND:${c.requestedAt.toISOString()}`, {
      userId: c.student.userId,
      studentId: c.studentId,
      type: "RULE_CONSENT_REMIND",
      title: "수강 규칙 동의 리마인드",
      body: `${c.pass.name} 수강 규칙에 아직 동의하지 않았습니다.`,
      url: "/s/requests",
      responseRequired: true,
    });
  }

  // 잔여 3회 이하, 만료 7일 전 (양쪽, 이용권마다 한 번)
  const passes = await db.pass.findMany({
    where: {
      status: "ACTIVE",
      endDate: { gte: new Date(now.getTime() - DAY) },
    },
    include: { student: { select: { id: true, userId: true, name: true } } },
  });
  const today = toKstDateKey(now);
  const byStudent = new Map<
    string,
    Awaited<ReturnType<typeof loadCountInputs>>
  >();
  for (const p of passes) {
    if (!byStudent.has(p.studentId))
      byStudent.set(p.studentId, await loadCountInputs(db, p.studentId));
    const { passes: ps, bookings } = byStudent.get(p.studentId)!;
    const remaining = allocateBookings(ps, bookings).remaining[p.id] ?? 0;
    const endKey = toKstDateKey(p.endDate);
    const targets = [
      {
        userId: p.student.userId,
        studentId: p.studentId,
        url: "/s/passes",
        who: "",
      },
      {
        userId: p.soldByTrainerId,
        studentId: null,
        url: `/t/students/${p.studentId}/passes`,
        who: `${p.student.name}님 `,
      },
    ];
    if (remaining > 0 && remaining <= 3) {
      for (const t of targets) {
        const dedupeKey = `PASS_LOW:${p.id}:${t.userId ?? p.studentId}:${p.count + p.bonusCount}`;
        if (await db.notification.findUnique({ where: { dedupeKey } }))
          continue;
        await queueNotification(
          db,
          {
            userId: t.userId,
            studentId: t.studentId,
            type: "PASS_LOW",
            title: "잔여 횟수 안내",
            body: `${t.who}${p.name} 잔여 ${remaining}회`,
            url: t.url,
            dedupeKey,
          },
          now,
        );
        out.passAlerts += 1;
      }
    }
    const daysLeft = Math.round(
      (new Date(`${endKey}T00:00:00+09:00`).getTime() -
        new Date(`${today}T00:00:00+09:00`).getTime()) /
        DAY,
    );
    if (daysLeft >= 0 && daysLeft <= 7) {
      for (const t of targets) {
        const dedupeKey = `PASS_EXPIRY:${p.id}:${t.userId ?? p.studentId}:${endKey}`;
        if (await db.notification.findUnique({ where: { dedupeKey } }))
          continue;
        await queueNotification(
          db,
          {
            userId: t.userId,
            studentId: t.studentId,
            type: "PASS_EXPIRY",
            title: "만료 예정",
            body: `${t.who}${p.name} 만료일 ${endKey}`,
            url: t.url,
            dedupeKey,
          },
          now,
        );
        out.passAlerts += 1;
      }
    }
  }
  return out;
}
