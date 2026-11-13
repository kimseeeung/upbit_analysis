import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireApiSession, route } from "@/server/http";
import { getManualNotifyList } from "@/server/notify/manual-list";

export const GET = route(async () => {
  const s = await requireApiSession(["TRAINER"]);
  return NextResponse.json({
    students: await getManualNotifyList(getDb(), s.principal.userId),
  });
});
