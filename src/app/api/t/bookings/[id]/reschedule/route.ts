import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  requestTimeChange,
  reschedulePendingByTrainer,
} from "@/server/bookings/booking-service";
import { asDate } from "@/server/booking-input";
import { AppError } from "@/server/errors";
import { readJson, requireApiSession, route } from "@/server/http";

/**
 * 캘린더에서 드래그 (4.4, 4.6):
 * 확정 대기는 그대로 수정(확정 요청 다시 보냄), 확정된 예약은 변경 요청이 된다.
 */
export const POST = route<RouteContext<"/api/t/bookings/[id]/reschedule">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const b = await readJson<Record<string, unknown>>(request);
    const db = getDb();
    const start = asDate(b.startAt);
    const end = asDate(b.endAt);
    const booking = await db.booking.findUnique({
      where: { id },
      select: { status: true, trainerId: true },
    });
    if (!booking || booking.trainerId !== s.principal.userId)
      throw new AppError("NOT_FOUND", "예약을 찾을 수 없습니다", 404);
    if (booking.status === "PENDING_CONFIRM") {
      await reschedulePendingByTrainer(db, {
        trainerId: s.principal.userId,
        bookingId: id,
        start,
        end,
      });
      return NextResponse.json({ mode: "MODIFIED" });
    }
    await requestTimeChange(db, {
      actorUserId: s.principal.userId,
      role: "TRAINER",
      bookingId: id,
      slots: [{ start, end }],
    });
    return NextResponse.json({ mode: "CHANGE_REQUESTED" });
  },
);
