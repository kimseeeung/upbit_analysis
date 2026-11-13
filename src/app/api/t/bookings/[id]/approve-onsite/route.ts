import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { approveWithPin } from "@/server/bookings/approval-service";
import { readJson, requireApiSession, route } from "@/server/http";

/** 현장 완료 승인: 트레이너 기기에서 수강생이 PIN 입력 (5.1) */
export const POST = route<RouteContext<"/api/t/bookings/[id]/approve-onsite">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const b = await readJson<{ pin?: unknown }>(request);
    await approveWithPin(getDb(), {
      method: "PIN_ONSITE",
      trainerId: s.principal.userId,
      bookingId: id,
      pin: String(b.pin ?? ""),
    });
    return NextResponse.json({ ok: true });
  },
);
