import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { respondConfirmRequest } from "@/server/bookings/booking-service";
import { asReason } from "@/server/booking-input";
import { readJson, requireApiSession, route } from "@/server/http";

export const POST = route<RouteContext<"/api/s/bookings/[id]/confirm">>(
  async (request, ctx) => {
    const s = await requireApiSession(["STUDENT"]);
    const { id } = await ctx.params;
    const b = await readJson<Record<string, unknown>>(request);
    const n = await respondConfirmRequest(getDb(), {
      userId: s.principal.userId,
      bookingId: id,
      accept: b.accept === true,
      reason: asReason(b.reason),
      wholeGroup: b.wholeGroup === true,
    });
    return NextResponse.json({ ok: true, count: n });
  },
);
