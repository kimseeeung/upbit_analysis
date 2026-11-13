import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  findMergeCandidates,
  mergeTemporaryStudent,
} from "@/server/students/student-service";
import { readJson, requireApiSession, route } from "@/server/http";
import { asString } from "@/server/validate";

export const GET = route(async () => {
  const s = await requireApiSession(["STUDENT"]);
  return NextResponse.json({
    candidates: await findMergeCandidates(getDb(), s.principal.userId),
  });
});

export const POST = route(async (request) => {
  const s = await requireApiSession(["STUDENT"]);
  const b = await readJson<{ studentId?: unknown }>(request);
  await mergeTemporaryStudent(
    getDb(),
    s.principal.userId,
    asString(b.studentId),
  );
  return NextResponse.json({ ok: true });
});
