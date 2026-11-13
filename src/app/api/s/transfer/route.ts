import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { startTransfer } from "@/server/center/transfer-service";
import { readJson, requireApiSession, route } from "@/server/http";
import { asString } from "@/server/validate";

/** 수강생: 트레이너 변경 */
export const POST = route(async (request) => {
  const s = await requireApiSession(["STUDENT"]);
  const b = await readJson<{ toTrainerId?: unknown }>(request);
  const t = await startTransfer(getDb(), {
    initiator: "STUDENT",
    actorUserId: s.principal.userId,
    toTrainerId: asString(b.toTrainerId, "새 트레이너"),
  });
  return NextResponse.json({ transferId: t.id });
});
