import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireApiSession, route } from "@/server/http";
import { listNotices } from "@/server/admin/notice-service";

export const GET = route(async () => {
  await requireApiSession();
  return NextResponse.json({ notices: await listNotices(getDb()) });
});
