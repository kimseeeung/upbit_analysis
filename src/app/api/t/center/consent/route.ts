import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { consentMembership } from "@/server/center/center-service";
import { readJson, requireApiSession, route } from "@/server/http";
import { asString } from "@/server/validate";

export const POST = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const b = await readJson<{ membershipId?: unknown }>(request);
  await consentMembership(
    getDb(),
    s.principal.userId,
    asString(b.membershipId),
  );
  return NextResponse.json({ ok: true });
});
