import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { respondCancelRequest } from "@/server/bookings/booking-service";
import { asReason } from "@/server/booking-input";
import { readJson, requireApiSession, route } from "@/server/http";

export const POST = route<RouteContext<"/api/t/bookings/[id]/cancel-response">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const b = await readJson<Record<string, unknown>>(request);
    const d = await respondCancelRequest(getDb(), {
      trainerId: s.principal.userId,
      bookingId: id,
      accept: b.accept === true,
      reason: asReason(b.reason),
    });
    return NextResponse.json({
      ok: true,
      deducted: d?.deduct ?? false,
      skippedReason: d?.skippedReason ?? null,
    });
  },
);
