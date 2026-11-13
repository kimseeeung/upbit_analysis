import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requestMembership } from "@/server/center/center-service";
import { readJson, requireApiSession, route } from "@/server/http";
import { asString } from "@/server/validate";

export const POST = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const b = await readJson<{ centerId?: unknown }>(request);
  await requestMembership(
    getDb(),
    s.principal.userId,
    asString(b.centerId, "센터"),
  );
  return NextResponse.json({ ok: true });
});
