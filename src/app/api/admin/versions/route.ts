import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { route } from "@/server/http";
import { requireApiOperator } from "@/server/admin/http";
import { listRollbacks, listVersions } from "@/server/admin/version-service";

export const GET = route(async () => {
  await requireApiOperator();
  const db = getDb();
  return NextResponse.json({
    ...(await listVersions(db)),
    rollbacks: await listRollbacks(db),
  });
});
