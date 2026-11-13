import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createInvite } from "@/server/center/center-service";
import { readJson, requireApiSession, route } from "@/server/http";

export const POST = route(async (request) => {
  const s = await requireApiSession(["CENTER_ADMIN", "TRAINER"]);
  const b = await readJson<{ kind?: unknown }>(request);
  const r = await createInvite(
    getDb(),
    s.principal.userId,
    b.kind === "ADMIN" ? "ADMIN" : "TRAINER",
  );
  return NextResponse.json({
    code: r.code,
    expiresAt: r.expiresAt.toISOString(),
  });
});
