import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCenterTrainers } from "@/server/center/center-views";
import { requireApiSession, route } from "@/server/http";

export const GET = route(async () => {
  const s = await requireApiSession(["CENTER_ADMIN", "TRAINER"]);
  return NextResponse.json(
    await getCenterTrainers(getDb(), s.principal.userId),
  );
});
