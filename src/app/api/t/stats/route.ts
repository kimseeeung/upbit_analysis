import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireApiSession, route } from "@/server/http";
import { getTrainerStats } from "@/server/stats/stats-service";

export const GET = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const u = new URL(request.url);
  return NextResponse.json(
    await getTrainerStats(
      getDb(),
      s.principal.userId,
      u.searchParams.get("from") ?? "",
      u.searchParams.get("to") ?? "",
    ),
  );
});
