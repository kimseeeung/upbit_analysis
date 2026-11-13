import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { registerTemporaryStudent } from "@/server/students/student-service";
import { readJson, requireApiSession, route } from "@/server/http";
import { asString } from "@/server/validate";

export const POST = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const b = await readJson<{ name?: unknown; phone?: unknown }>(request);
  const st = await registerTemporaryStudent(getDb(), s.principal.userId, {
    name: asString(b.name, "이름"),
    phone: asString(b.phone, "전화번호"),
  });
  return NextResponse.json({ studentId: st.id });
});
