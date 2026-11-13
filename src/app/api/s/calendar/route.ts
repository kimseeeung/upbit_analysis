import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStudentCalendar } from "@/server/bookings/calendar-service";
import { requireApiSession, route } from "@/server/http";

export const GET = route(async (request) => {
  const s = await requireApiSession(["STUDENT"]);
  const u = new URL(request.url);
  return NextResponse.json(
    await getStudentCalendar(
      getDb(),
      s.principal.userId,
      u.searchParams.get("from") ?? "",
      u.searchParams.get("to") ?? "",
    ),
  );
});
