import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { route } from "@/server/http";
import { requireApiOperator } from "@/server/admin/http";
import { listNotificationHistory } from "@/server/admin/member-admin-service";

export const GET = route(async (request) => {
  await requireApiOperator();
  const status = new URL(request.url).searchParams.get("status") ?? undefined;
  return NextResponse.json({
    notifications: await listNotificationHistory(getDb(), { status }),
  });
});
