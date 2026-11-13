import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { AppError } from "@/server/errors";
import { requireApiSession, route } from "@/server/http";

/** 새 트레이너가 수락 전에 보는 내용: 수강생, 이전 트레이너의 예정 예약 */
export const GET = route<RouteContext<"/api/t/transfers/[id]">>(
  async (_req, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const db = getDb();
    const t = await db.transferRequest.findFirst({
      where: { id, toTrainerId: s.principal.userId },
    });
    if (!t) throw new AppError("NOT_FOUND", "요청을 찾을 수 없습니다", 404);
    const student = await db.student.findUniqueOrThrow({
      where: { id: t.studentId },
      select: { name: true },
    });
    const bookings = t.fromTrainerId
      ? await db.booking.findMany({
          where: {
            studentId: t.studentId,
            trainerId: t.fromTrainerId,
            status: {
              in: ["REQUESTED", "PENDING_CONFIRM", "CONFIRMED", "INSUFFICIENT"],
            },
            startAt: { gt: new Date() },
          },
          orderBy: { startAt: "asc" },
          select: { id: true, startAt: true, endAt: true, status: true },
        })
      : [];
    return NextResponse.json({
      id: t.id,
      studentName: student.name,
      initiatedBy: t.initiatedBy,
      passTransfer: t.passTransfer,
      bookings: bookings.map((b) => ({
        ...b,
        startAt: b.startAt.toISOString(),
        endAt: b.endAt.toISOString(),
      })),
    });
  },
);
