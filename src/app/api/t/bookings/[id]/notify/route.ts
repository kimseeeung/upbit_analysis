import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { setBookingNotify } from "@/server/notify/settings";
import { readJson, requireApiSession, route } from "@/server/http";

export const PATCH = route<RouteContext<"/api/t/bookings/[id]/notify">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const b = await readJson<{ dayBeforeOff?: boolean; twoHoursOff?: boolean }>(
      request,
    );
    await setBookingNotify(getDb(), s.principal.userId, id, b);
    return NextResponse.json({ ok: true });
  },
);
