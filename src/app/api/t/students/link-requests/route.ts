import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requestLinkToStudent } from "@/server/students/student-service";
import { readJson, requireApiSession, route } from "@/server/http";
import { asString } from "@/server/validate";

export const POST = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const b = await readJson<{ studentId?: unknown }>(request);
  const r = await requestLinkToStudent(
    getDb(),
    s.principal.userId,
    asString(b.studentId),
  );
  return NextResponse.json({ requestId: r.id });
});
