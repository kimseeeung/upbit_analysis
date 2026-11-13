import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { respondBookingRequest } from "@/server/bookings/booking-service";
import { asReason } from "@/server/booking-input";
import { readJson, requireApiSession, route } from "@/server/http";

export const POST = route<RouteContext<"/api/t/bookings/[id]/respond-request">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const b = await readJson<Record<string, unknown>>(request);
    await respondBookingRequest(getDb(), {
      trainerId: s.principal.userId,
      bookingId: id,
      accept: b.accept === true,
      reason: asReason(b.reason),
    });
    return NextResponse.json({ ok: true });
  },
);
