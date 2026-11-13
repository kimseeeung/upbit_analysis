import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getTrainerCalendar } from "@/server/bookings/calendar-service";
import { requireApiSession, route } from "@/server/http";

export const GET = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const u = new URL(request.url);
  return NextResponse.json(
    await getTrainerCalendar(
      getDb(),
      s.principal.userId,
      u.searchParams.get("from") ?? "",
      u.searchParams.get("to") ?? "",
    ),
  );
});
