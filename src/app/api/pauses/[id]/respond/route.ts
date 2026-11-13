import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readJson, requireApiSession, route } from "@/server/http";
import { pauseActor } from "@/server/pause-actor";
import { respondPause } from "@/server/passes/pause-service";

export const POST = route<RouteContext<"/api/pauses/[id]/respond">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER", "STUDENT"]);
    const { id } = await ctx.params;
    const b = await readJson<{ approve?: unknown }>(request).catch(
      () => ({}) as { approve?: unknown },
    );
    void b;
    const r = await respondPause(getDb(), {
      actor: pauseActor(s),
      pauseId: id,
      approve: b.approve === true,
    });
    return NextResponse.json({ ok: true, result: r ?? null });
  },
);
