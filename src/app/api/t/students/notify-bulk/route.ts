import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { setStudentNotify } from "@/server/notify/settings";
import { readJson, requireApiSession, route } from "@/server/http";

export const POST = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const b = await readJson<{
    studentIds?: unknown;
    notifyDayBefore?: boolean;
    notify2h?: boolean;
  }>(request);
  const ids = Array.isArray(b.studentIds)
    ? b.studentIds.filter((x): x is string => typeof x === "string")
    : [];
  await setStudentNotify(getDb(), s.principal.userId, ids, b);
  return NextResponse.json({ ok: true });
});
