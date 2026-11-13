import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readJson, requireApiSession, route } from "@/server/http";
import { resolveConflict } from "@/server/offline/offline-service";

export const POST = route<RouteContext<"/api/t/sync-conflicts/[id]">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const b = await readJson<{ choice?: unknown }>(request);
    await resolveConflict(
      getDb(),
      s.principal.userId,
      id,
      b.choice === "APPLY_LOCAL" ? "APPLY_LOCAL" : "KEEP_SERVER",
    );
    return NextResponse.json({ ok: true });
  },
);
