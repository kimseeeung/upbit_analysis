import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { formatKstMonthDay, toKstTimeString } from "@/lib/time";
import { AppError } from "@/server/errors";
import { requireApiSession, route } from "@/server/http";
import { queueNotification } from "@/server/notify/notify-service";
import { assertTrainerStudent } from "@/server/students/access";

/** 예약 상세의 "다시 보내기": 수업 안내 알림을 지금 다시 (야간이면 08:00) */
export const POST = route<RouteContext<"/api/t/bookings/[id]/resend">>(
  async (_req, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const db = getDb();
    const b = await db.booking.findUnique({
      where: { id },
      include: { student: true },
    });
    if (!b || b.trainerId !== s.principal.userId)
      throw new AppError("NOT_FOUND", "예약을 찾을 수 없습니다", 404);
    await assertTrainerStudent(db, s.principal.userId, b.studentId);
    const n = await queueNotification(db, {
      userId: b.student.userId,
      studentId: b.studentId,
      bookingId: b.id,
      type:
        b.status === "PENDING_CONFIRM" ? "CONFIRM_REQUEST" : "LESSON_NOTICE",
      title: b.status === "PENDING_CONFIRM" ? "예약 확정 요청" : "수업 안내",
      body: `${formatKstMonthDay(b.startAt)} ${toKstTimeString(b.startAt)} 수업이 있습니다.${b.status === "PENDING_CONFIRM" ? " 수락해 주세요." : ""}`,
      url: b.status === "PENDING_CONFIRM" ? "/s/requests" : "/s",
      responseRequired: b.status === "PENDING_CONFIRM",
    });
    return NextResponse.json({
      ok: true,
      sendAt: n.sendAt.toISOString(),
      needsManualShare: n.needsManualShare,
    });
  },
);
