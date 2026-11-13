import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { respondLinkRequest } from "@/server/students/student-service";
import { readJson, requireApiSession, route } from "@/server/http";

export const POST = route<RouteContext<"/api/requests/link/[id]">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER", "STUDENT"]);
    const { id } = await ctx.params;
    const b = await readJson<{ accept?: unknown }>(request);
    await respondLinkRequest(getDb(), {
      userId: s.principal.userId,
      requestId: id,
      accept: b.accept === true,
    });
    return NextResponse.json({ ok: true });
  },
);
