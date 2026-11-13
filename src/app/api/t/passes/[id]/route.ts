import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parsePassInput } from "@/server/passes/pass-input";
import { updatePass } from "@/server/passes/pass-service";
import { readJson, requireApiSession, route } from "@/server/http";

export const PATCH = route<RouteContext<"/api/t/passes/[id]">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const b = await readJson<Record<string, unknown>>(request);
    await updatePass(getDb(), s.principal.userId, id, parsePassInput(b));
    return NextResponse.json({ ok: true });
  },
);
