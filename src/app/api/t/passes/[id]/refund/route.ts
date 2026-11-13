import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { refundPass } from "@/server/passes/pass-service";
import { requireApiSession, route } from "@/server/http";

export const POST = route<RouteContext<"/api/t/passes/[id]/refund">>(
  async (_req, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    await refundPass(getDb(), s.principal.userId, id);
    return NextResponse.json({ ok: true });
  },
);
