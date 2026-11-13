import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { searchRegisteredStudents } from "@/server/students/student-service";
import { requireApiSession, route } from "@/server/http";

export const GET = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({
    students: await searchRegisteredStudents(getDb(), s.principal.userId, q),
  });
});
