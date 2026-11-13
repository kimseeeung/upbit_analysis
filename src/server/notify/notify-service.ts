import type { Prisma } from "@/generated/prisma/client";
import { adjustForNight, isNight } from "@/lib/notify/night";
import type { Db, RootDb } from "@/server/db-types";
import { getPushSender } from "./push-sender";

export interface QueueInput {
  userId?: string | null;
  studentId?: string | null;
  bookingId?: string | null;
  type: string;
  title: string;
  body: string;
  url?: string | null;
  /** 원래 알림 시각 (없으면 지금) */
  scheduledAt?: Date;
  dedupeKey?: string;
  /** 받는 사람이 알림을 받을 수 없으면 트레이너가 카톡으로 직접 보내야 하는 알림인가 */
  responseRequired?: boolean;
}

/** 이 회원이 웹 푸시를 받을 수 있는가 (구독이 있고 실패하지 않음) */
export async function isPushReachable(
  db: Db,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  return (
    (await db.pushSubscription.count({ where: { userId, failedAt: null } })) > 0
  );
}

/**
 * 자동 알림을 예약한다. 21:00~08:00이면 08:00으로 미룬다(8.3).
 * 같은 dedupeKey가 있으면 다시 만들지 않는다.
 */
export async function queueNotification(
  db: Db,
  input: QueueInput,
  now = new Date(),
) {
  const scheduledAt = input.scheduledAt ?? now;
  const base = scheduledAt < now ? now : scheduledAt;
  const reachable = await isPushReachable(db, input.userId);
  const data: Prisma.NotificationUncheckedCreateInput = {
    userId: input.userId ?? null,
    studentId: input.studentId ?? null,
    bookingId: input.bookingId ?? null,
    type: input.type,
    title: input.title,
    body: input.body,
    url: input.url ?? null,
    scheduledAt,
    sendAt: adjustForNight(base),
    needsManualShare: !!input.responseRequired && !reachable,
    dedupeKey: input.dedupeKey ?? null,
    createdAt: now,
  };
  if (input.dedupeKey) {
    return db.notification.upsert({
      where: { dedupeKey: input.dedupeKey },
      update: {},
      create: data,
    });
  }
  return db.notification.create({ data });
}

/** 보내지 않기로 한 알림도 기록으로 남긴다 (예: 알림 시각이 이미 지남) */
export async function recordSkipped(
  db: Db,
  input: QueueInput & { reason: string },
  now = new Date(),
) {
  const data: Prisma.NotificationUncheckedCreateInput = {
    userId: input.userId ?? null,
    studentId: input.studentId ?? null,
    bookingId: input.bookingId ?? null,
    type: input.type,
    title: input.title,
    body: input.body,
    url: input.url ?? null,
    scheduledAt: input.scheduledAt ?? now,
    sendAt: input.scheduledAt ?? now,
    status: "SKIPPED",
    failReason: input.reason,
    dedupeKey: input.dedupeKey ?? null,
    createdAt: now,
  };
  if (input.dedupeKey) {
    return db.notification.upsert({
      where: { dedupeKey: input.dedupeKey },
      update: {},
      create: data,
    });
  }
  return db.notification.create({ data });
}

const REMINDER_TYPES = ["DAY_BEFORE", "TWO_HOURS"];
const ACTIVE_BOOKING = ["CONFIRMED", "PENDING_CONFIRM"];

/**
 * 보낼 시각이 된 알림을 보낸다.
 * 야간(21:00~08:00)에는 한 건도 보내지 않는다 — 시각 보정이 잘못돼도 여기서 한 번 더 막는다.
 */
export async function deliverDueNotifications(
  db: RootDb,
  now = new Date(),
  limit = 200,
) {
  const result = { sent: 0, failed: 0, canceled: 0, deferred: 0 };
  if (isNight(now)) {
    const r = await db.notification.updateMany({
      where: { status: "SCHEDULED", sendAt: { lte: now } },
      data: { sendAt: adjustForNight(now) },
    });
    result.deferred = r.count;
    return result;
  }
  const due = await db.notification.findMany({
    where: { status: "SCHEDULED", sendAt: { lte: now }, channel: "WEB_PUSH" },
    orderBy: { sendAt: "asc" },
    take: limit,
  });
  const sender = getPushSender();
  for (const n of due) {
    // 취소된 예약·시간이 바뀐 예약의 수업 알림은 보내지 않는다
    if (n.bookingId && REMINDER_TYPES.includes(n.type)) {
      const b = await db.booking.findUnique({
        where: { id: n.bookingId },
        select: { status: true, startAt: true },
      });
      const stale =
        !b ||
        !ACTIVE_BOOKING.includes(b.status) ||
        (n.dedupeKey && !n.dedupeKey.endsWith(b.startAt.toISOString()));
      if (stale || (b && b.startAt <= now)) {
        await db.notification.update({
          where: { id: n.id },
          data: { status: "CANCELED", failReason: "BOOKING_CHANGED" },
        });
        result.canceled += 1;
        continue;
      }
    }
    if (!n.userId) {
      await db.notification.update({
        where: { id: n.id },
        data: { status: "FAILED", failReason: "NO_ACCOUNT", sentAt: now },
      });
      result.failed += 1;
      continue;
    }
    const subs = await db.pushSubscription.findMany({
      where: { userId: n.userId, failedAt: null },
    });
    if (subs.length === 0) {
      await db.notification.update({
        where: { id: n.id },
        data: { status: "FAILED", failReason: "NO_SUBSCRIPTION", sentAt: now },
      });
      result.failed += 1;
      continue;
    }
    let ok = false;
    let reason = "";
    for (const s of subs) {
      const r = await sender.send(s, {
        id: n.id,
        title: n.title,
        body: n.body,
        url: n.url,
        actions:
          n.type === "DAY_BEFORE"
            ? [
                {
                  action: "confirm",
                  title: n.body.includes("수락") ? "수락" : "확인했어요",
                },
              ]
            : [],
      });
      if (r.ok) ok = true;
      else {
        reason = r.reason;
        if (r.gone)
          await db.pushSubscription
            .delete({ where: { id: s.id } })
            .catch(() => undefined);
        else
          await db.pushSubscription.update({
            where: { id: s.id },
            data: { failedAt: now },
          });
      }
    }
    await db.notification.update({
      where: { id: n.id },
      data: ok
        ? { status: "SENT", sentAt: now }
        : {
            status: "FAILED",
            failReason: reason || "SEND_FAILED",
            sentAt: now,
          },
    });
    if (ok) result.sent += 1;
    else result.failed += 1;
  }
  return result;
}

/** 알림을 눌러 앱을 열었거나 "확인했어요"를 누름 */
export async function markNotificationConfirmed(
  db: Db,
  userId: string,
  notificationId: string,
  now = new Date(),
) {
  const r = await db.notification.updateMany({
    where: { id: notificationId, userId, confirmedAt: null },
    data: { confirmedAt: now },
  });
  return r.count > 0;
}

/** 예약이 취소되면 남은 수업 알림을 취소한다 */
export async function cancelBookingReminders(db: Db, bookingId: string) {
  await db.notification.updateMany({
    where: { bookingId, status: "SCHEDULED", type: { in: REMINDER_TYPES } },
    data: { status: "CANCELED", failReason: "BOOKING_CHANGED" },
  });
}
