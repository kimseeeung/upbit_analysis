import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { route } from "@/server/http";
import { requireApiOperator } from "@/server/admin/http";
import { markAlertsRead } from "@/server/admin/operator-service";

export const POST = route(async () => {
  const op = await requireApiOperator();
  await markAlertsRead(getDb(), op.operatorId);
  return NextResponse.json({ ok: true });
});
