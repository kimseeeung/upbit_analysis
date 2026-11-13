import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { approveWithPin } from "@/server/bookings/approval-service";
import { readJson, requireApiSession, route } from "@/server/http";

/** 앱 완료 승인: 수강생 요청함에서 PIN 입력 (5.1) */
export const POST = route<RouteContext<"/api/s/bookings/[id]/approve">>(
  async (request, ctx) => {
    const s = await requireApiSession(["STUDENT"]);
    const { id } = await ctx.params;
    const b = await readJson<{ pin?: unknown }>(request);
    await approveWithPin(getDb(), {
      method: "PIN_APP",
      studentUserId: s.principal.userId,
      bookingId: id,
      pin: String(b.pin ?? ""),
    });
    return NextResponse.json({ ok: true });
  },
);
