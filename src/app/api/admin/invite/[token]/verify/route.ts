import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readJson, route } from "@/server/http";
import { assertAdminIp } from "@/server/admin/http";
import { verifyCode } from "@/server/auth/sms-service";

export const POST = route(async (request) => {
  await assertAdminIp();
  const b = await readJson<{ verificationId?: string; code?: string }>(request);
  await verifyCode(getDb(), {
    verificationId: String(b.verificationId ?? ""),
    code: String(b.code ?? ""),
  });
  return NextResponse.json({ ok: true });
});
