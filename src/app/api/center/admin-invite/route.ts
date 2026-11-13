import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { acceptAdminInvite } from "@/server/center/center-service";
import { readJson, requireApiSession, route } from "@/server/http";
import { asString } from "@/server/validate";

/** 관리자 초대 코드 수락 (센터 관리자 유형 또는 트레이너) */
export const POST = route(async (request) => {
  const s = await requireApiSession(["CENTER_ADMIN", "TRAINER"]);
  const b = await readJson<{ code?: unknown }>(request);
  const c = await acceptAdminInvite(
    getDb(),
    s.principal.userId,
    asString(b.code, "초대 코드"),
  );
  return NextResponse.json({ centerName: c.name });
});
