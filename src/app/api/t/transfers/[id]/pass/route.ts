import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { decidePassTransfer } from "@/server/center/transfer-service";
import { readJson, requireApiSession, route } from "@/server/http";

/** 이전 트레이너: 남은 이용권 넘기기 동의·거절 */
export const POST = route<RouteContext<"/api/t/transfers/[id]/pass">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const b = await readJson<{ agree?: unknown }>(request);
    await decidePassTransfer(getDb(), {
      trainerId: s.principal.userId,
      transferId: id,
      agree: b.agree === true,
    });
    return NextResponse.json({ ok: true });
  },
);
