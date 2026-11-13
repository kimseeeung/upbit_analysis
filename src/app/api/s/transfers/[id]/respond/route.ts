import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { respondTransferAsStudent } from "@/server/center/transfer-service";
import { readJson, requireApiSession, route } from "@/server/http";

export const POST = route<RouteContext<"/api/s/transfers/[id]/respond">>(
  async (request, ctx) => {
    const s = await requireApiSession(["STUDENT"]);
    const { id } = await ctx.params;
    const b = await readJson<{ agree?: unknown }>(request);
    await respondTransferAsStudent(getDb(), {
      userId: s.principal.userId,
      transferId: id,
      agree: b.agree === true,
    });
    return NextResponse.json({ ok: true });
  },
);
