import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { proposeOtherTimes } from "@/server/bookings/booking-service";
import { asSlots } from "@/server/booking-input";
import { readJson, requireApiSession, route } from "@/server/http";

export const POST = route<RouteContext<"/api/s/bookings/[id]/propose">>(
  async (request, ctx) => {
    const s = await requireApiSession(["STUDENT"]);
    const { id } = await ctx.params;
    const b = await readJson<{ slots?: unknown }>(request);
    await proposeOtherTimes(getDb(), {
      userId: s.principal.userId,
      bookingId: id,
      slots: asSlots(b.slots),
    });
    return NextResponse.json({ ok: true });
  },
);
