import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  listTrainerStudents,
  type StudentListFilter,
} from "@/server/students/student-service";
import { requireApiSession, route } from "@/server/http";

const FILTERS: StudentListFilter[] = ["ALL", "ACTIVE", "EXPIRED", "STOPPED"];

export const GET = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const url = new URL(request.url);
  const f = url.searchParams.get("filter") as StudentListFilter | null;
  const students = await listTrainerStudents(getDb(), s.principal.userId, {
    q: url.searchParams.get("q") ?? undefined,
    filter: f && FILTERS.includes(f) ? f : "ALL",
  });
  return NextResponse.json({ students });
});
