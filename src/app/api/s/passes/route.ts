import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getMyPasses } from "@/server/students/detail-service";
import { getStudentOfUser } from "@/server/students/access";
import { requireApiSession, route } from "@/server/http";

export const GET = route(async () => {
  const s = await requireApiSession(["STUDENT"]);
  const db = getDb();
  const student = await getStudentOfUser(db, s.principal.userId);
  return NextResponse.json(await getMyPasses(db, student.id));
});
