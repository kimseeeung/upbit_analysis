import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { joinWithInvite } from "@/server/center/center-service";
import { readJson, requireApiSession, route } from "@/server/http";
import { asString } from "@/server/validate";

export const POST = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const b = await readJson<{ code?: unknown; consent?: unknown }>(request);
  const c = await joinWithInvite(
    getDb(),
    s.principal.userId,
    asString(b.code, "초대 코드"),
    b.consent === true,
  );
  return NextResponse.json({ centerName: c.name });
});
