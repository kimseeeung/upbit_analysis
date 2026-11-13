import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { centerApprovePassTransfer } from "@/server/center/transfer-service";
import { requireApiSession, route } from "@/server/http";

/** 같은 센터 안 인계의 남은 이용권 이동 승인 (본인 관련 건 제외) */
export const POST = route<RouteContext<"/api/c/transfers/[id]/approve-pass">>(
  async (_req, ctx) => {
    const s = await requireApiSession(["CENTER_ADMIN", "TRAINER"]);
    const { id } = await ctx.params;
    await centerApprovePassTransfer(getDb(), {
      adminId: s.principal.userId,
      transferId: id,
    });
    return NextResponse.json({ ok: true });
  },
);
