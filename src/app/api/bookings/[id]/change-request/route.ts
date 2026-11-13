import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requestTimeChange } from "@/server/bookings/booking-service";
import { asSlots } from "@/server/booking-input";
import { readJson, requireApiSession, route } from "@/server/http";

/** 시간 변경 요청 (트레이너·수강생) */
export const POST = route<RouteContext<"/api/bookings/[id]/change-request">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER", "STUDENT"]);
    const { id } = await ctx.params;
    const b = await readJson<{ slots?: unknown }>(request);
    await requestTimeChange(getDb(), {
      actorUserId: s.principal.userId,
      role: s.principal.role === "TRAINER" ? "TRAINER" : "STUDENT",
      bookingId: id,
      slots: asSlots(b.slots),
    });
    return NextResponse.json({ ok: true });
  },
);
