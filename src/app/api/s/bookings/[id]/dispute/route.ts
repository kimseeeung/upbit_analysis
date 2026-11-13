import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { raiseDispute } from "@/server/bookings/approval-service";
import { readJson, requireApiSession, route } from "@/server/http";

/** 완료 승인 거절 / 노쇼 이의 제기 (5.2) */
export const POST = route<RouteContext<"/api/s/bookings/[id]/dispute">>(
  async (request, ctx) => {
    const s = await requireApiSession(["STUDENT"]);
    const { id } = await ctx.params;
    const b = await readJson<{ reason?: unknown }>(request);
    await raiseDispute(getDb(), {
      studentUserId: s.principal.userId,
      bookingId: id,
      reason: String(b.reason ?? ""),
    });
    return NextResponse.json({ ok: true });
  },
);
