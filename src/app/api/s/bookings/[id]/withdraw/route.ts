import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withdrawBookingRequest } from "@/server/bookings/booking-service";
import { requireApiSession, route } from "@/server/http";

export const POST = route<RouteContext<"/api/s/bookings/[id]/withdraw">>(
  async (_req, ctx) => {
    const s = await requireApiSession(["STUDENT"]);
    const { id } = await ctx.params;
    await withdrawBookingRequest(getDb(), {
      userId: s.principal.userId,
      bookingId: id,
    });
    return NextResponse.json({ ok: true });
  },
);
