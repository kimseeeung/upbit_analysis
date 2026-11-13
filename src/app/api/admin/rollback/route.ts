import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readJson, route } from "@/server/http";
import { requireApiOperator } from "@/server/admin/http";
import { rollback } from "@/server/admin/version-service";

/** 롤백 / 다시 최신 버전으로 (12.3) */
export const POST = route(async (request) => {
  const op = await requireApiOperator();
  const b = await readJson<{
    toVersion?: string;
    pin?: string;
    reason?: string;
  }>(request);
  const log = await rollback(getDb(), op.operatorId, {
    toVersion: String(b.toVersion ?? ""),
    pin: String(b.pin ?? ""),
    reason: String(b.reason ?? ""),
  });
  return NextResponse.json({ log });
});
