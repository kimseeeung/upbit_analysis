import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCenterPayments } from "@/server/center/center-views";
import { requireApiSession, route } from "@/server/http";

export const GET = route(async (request) => {
  const s = await requireApiSession(["CENTER_ADMIN", "TRAINER"]);
  const u = new URL(request.url);
  return NextResponse.json(
    await getCenterPayments(
      getDb(),
      s.principal.userId,
      u.searchParams.get("from") ?? "",
      u.searchParams.get("to") ?? "",
    ),
  );
});
