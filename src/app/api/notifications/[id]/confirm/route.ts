import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { respondConfirmRequest } from "@/server/bookings/booking-service";
import { markNotificationConfirmed } from "@/server/notify/notify-service";
import { readJson, requireApiSession, route } from "@/server/http";

/**
 * 알림을 눌러 앱을 열었거나 "확인했어요"를 누름 (4.8).
 * 전일 알림의 "수락"(확정 대기 예약)이면 예약도 수락한다.
 */
export const POST = route<RouteContext<"/api/notifications/[id]/confirm">>(
  async (request, ctx) => {
    const s = await requireApiSession();
    const { id } = await ctx.params;
    const b = await readJson<{ accept?: unknown }>(request).catch(() => ({
      accept: false,
    }));
    const db = getDb();
    await markNotificationConfirmed(db, s.principal.userId, id);
    if (b.accept === true) {
      const n = await db.notification.findFirst({
        where: { id, userId: s.principal.userId, type: "DAY_BEFORE" },
      });
      if (n?.bookingId) {
        const booking = await db.booking.findUnique({
          where: { id: n.bookingId },
          select: { status: true },
        });
        if (booking?.status === "PENDING_CONFIRM") {
          await respondConfirmRequest(db, {
            userId: s.principal.userId,
            bookingId: n.bookingId,
            accept: true,
          });
        }
      }
    }
    return NextResponse.json({ ok: true });
  },
);
