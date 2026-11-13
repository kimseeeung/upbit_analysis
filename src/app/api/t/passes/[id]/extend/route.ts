import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { extendPass } from "@/server/passes/pass-service";
import { readJson, requireApiSession, route } from "@/server/http";
import { asString } from "@/server/validate";

export const POST = route<RouteContext<"/api/t/passes/[id]/extend">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const b = await readJson<{ endDate?: unknown }>(request);
    await extendPass(
      getDb(),
      s.principal.userId,
      id,
      asString(b.endDate, "만료일"),
    );
    return NextResponse.json({ ok: true });
  },
);
