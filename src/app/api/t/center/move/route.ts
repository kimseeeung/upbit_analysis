import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requestMove } from "@/server/center/departure-service";
import { readJson, requireApiSession, route } from "@/server/http";
import { asOptionalString } from "@/server/validate";

/** 센터 이동 신청 (지금 센터 떠나기): 수강생 선택 7일 뒤 적용 */
export const POST = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const b = await readJson<{ targetCenterId?: unknown }>(request);
  const d = await requestMove(
    getDb(),
    s.principal.userId,
    asOptionalString(b.targetCenterId),
  );
  return NextResponse.json({ deadlineAt: d.deadlineAt.toISOString() });
});
