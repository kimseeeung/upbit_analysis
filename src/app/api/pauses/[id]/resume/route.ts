import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readJson, requireApiSession, route } from "@/server/http";
import { pauseActor } from "@/server/pause-actor";
import { resumeEarly } from "@/server/passes/pause-service";

export const POST = route<RouteContext<"/api/pauses/[id]/resume">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER", "STUDENT"]);
    const { id } = await ctx.params;
    const b = await readJson<{ approve?: unknown }>(request).catch(
      () => ({}) as { approve?: unknown },
    );
    void b;
    const r = await resumeEarly(getDb(), { actor: pauseActor(s), pauseId: id });
    return NextResponse.json({ ok: true, result: r ?? null });
  },
);
