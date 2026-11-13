import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { resolveDispute } from "@/server/bookings/approval-service";
import { asReason } from "@/server/booking-input";
import { readJson, requireApiSession, route } from "@/server/http";

/** 이견 처리: 수강생 의견 수락 / 기존 처리 유지 (5.2) */
export const POST = route<
  RouteContext<"/api/t/bookings/[id]/dispute-decision">
>(async (request, ctx) => {
  const s = await requireApiSession(["TRAINER"]);
  const { id } = await ctx.params;
  const b = await readJson<{ decision?: unknown; reason?: unknown }>(request);
  await resolveDispute(getDb(), {
    trainerId: s.principal.userId,
    bookingId: id,
    decision: b.decision === "KEEP" ? "KEEP" : "ACCEPT_STUDENT",
    reason: asReason(b.reason),
  });
  return NextResponse.json({ ok: true });
});
