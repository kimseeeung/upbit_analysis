import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { startTransfer } from "@/server/center/transfer-service";
import { readJson, requireApiSession, route } from "@/server/http";
import { asString } from "@/server/validate";

/** 이전 트레이너의 인계 */
export const POST = route<RouteContext<"/api/t/students/[id]/transfer">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const b = await readJson<{
      toTrainerId?: unknown;
      passAgree?: unknown;
      memoTransfer?: unknown;
    }>(request);
    const t = await startTransfer(getDb(), {
      initiator: "TRAINER",
      actorUserId: s.principal.userId,
      studentId: id,
      toTrainerId: asString(b.toTrainerId, "새 트레이너"),
      passAgree: b.passAgree === true,
      memoTransfer: b.memoTransfer === true,
    });
    return NextResponse.json({ transferId: t.id });
  },
);
