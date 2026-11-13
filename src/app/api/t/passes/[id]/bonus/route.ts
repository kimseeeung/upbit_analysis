import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { addBonusCount } from "@/server/passes/pass-service";
import { readJson, requireApiSession, route } from "@/server/http";

export const POST = route<RouteContext<"/api/t/passes/[id]/bonus">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const b = await readJson<{ add?: unknown }>(request);
    await addBonusCount(getDb(), s.principal.userId, id, Number(b.add));
    return NextResponse.json({ ok: true });
  },
);
