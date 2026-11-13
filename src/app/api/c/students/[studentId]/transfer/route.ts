import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { startTransfer } from "@/server/center/transfer-service";
import { readJson, requireApiSession, route } from "@/server/http";
import { asString } from "@/server/validate";

/** 센터 관리자: 담당 변경 */
export const POST = route<RouteContext<"/api/c/students/[studentId]/transfer">>(
  async (request, ctx) => {
    const s = await requireApiSession(["CENTER_ADMIN", "TRAINER"]);
    const { studentId } = await ctx.params;
    const b = await readJson<{ toTrainerId?: unknown }>(request);
    const t = await startTransfer(getDb(), {
      initiator: "CENTER_ADMIN",
      actorUserId: s.principal.userId,
      studentId,
      toTrainerId: asString(b.toTrainerId, "새 트레이너"),
    });
    return NextResponse.json({
      transferId: t.id,
      passTransfer: t.passTransfer,
    });
  },
);
