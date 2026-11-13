import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { chooseProposal } from "@/server/bookings/booking-service";
import { readJson, requireApiSession, route } from "@/server/http";

export const POST = route<RouteContext<"/api/t/proposals/[id]/choose">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const b = await readJson<{ index?: unknown }>(request);
    await chooseProposal(getDb(), {
      trainerId: s.principal.userId,
      requestId: id,
      index: Number(b.index) || 0,
    });
    return NextResponse.json({ ok: true });
  },
);
