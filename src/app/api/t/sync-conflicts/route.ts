import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireApiSession, route } from "@/server/http";
import { listConflicts } from "@/server/offline/offline-service";

export const GET = route(async () => {
  const s = await requireApiSession(["TRAINER"]);
  return NextResponse.json({
    conflicts: await listConflicts(getDb(), s.principal.userId),
  });
});
