import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  previewStudentCancel,
  requestCancelByStudent,
} from "@/server/bookings/booking-service";
import { asReason } from "@/server/booking-input";
import { readJson, requireApiSession, route } from "@/server/http";

type Ctx = RouteContext<"/api/s/bookings/[id]/cancel-request">;

/** 지금 취소를 요청하면 차감되는지 미리 보기 */
export const GET = route<Ctx>(async (_req, ctx) => {
  const s = await requireApiSession(["STUDENT"]);
  const { id } = await ctx.params;
  return NextResponse.json(
    await previewStudentCancel(getDb(), {
      userId: s.principal.userId,
      bookingId: id,
    }),
  );
});

export const POST = route<Ctx>(async (request, ctx) => {
  const s = await requireApiSession(["STUDENT"]);
  const { id } = await ctx.params;
  const b = await readJson<{ reason?: unknown }>(request);
  await requestCancelByStudent(getDb(), {
    userId: s.principal.userId,
    bookingId: id,
    reason: asReason(b.reason),
  });
  return NextResponse.json({ ok: true });
});
