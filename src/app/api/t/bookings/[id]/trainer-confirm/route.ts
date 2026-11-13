import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { trainerConfirmCompletion } from "@/server/bookings/approval-service";
import { requireApiSession, route } from "@/server/http";

export const POST = route<RouteContext<"/api/t/bookings/[id]/trainer-confirm">>(
  async (_req, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    await trainerConfirmCompletion(getDb(), {
      trainerId: s.principal.userId,
      bookingId: id,
    });
    return NextResponse.json({ ok: true });
  },
);
