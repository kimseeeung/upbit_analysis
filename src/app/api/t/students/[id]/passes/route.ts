import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parsePassInput } from "@/server/passes/pass-input";
import { createPass } from "@/server/passes/pass-service";
import { readJson, requireApiSession, route } from "@/server/http";

export const POST = route<RouteContext<"/api/t/students/[id]/passes">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const b = await readJson<Record<string, unknown>>(request);
    const pass = await createPass(
      getDb(),
      s.principal.userId,
      id,
      parsePassInput(b),
    );
    return NextResponse.json({ passId: pass.id });
  },
);
