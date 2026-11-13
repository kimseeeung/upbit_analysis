import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { describeRules } from "@/lib/rules/rule-set";
import { markNoShow } from "@/server/bookings/approval-service";
import { requireApiSession, route } from "@/server/http";

export const POST = route<RouteContext<"/api/t/bookings/[id]/no-show">>(
  async (_req, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const r = await markNoShow(getDb(), {
      trainerId: s.principal.userId,
      bookingId: id,
    });
    return NextResponse.json({
      deducted: r.deducted,
      skippedReason: r.skippedReason,
      appliedRule: describeRules(r.rules).find((l) => l.title === "노쇼")?.text,
    });
  },
);
