import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyCode } from "@/server/auth/sms-service";
import { readJson, route } from "@/server/http";
import { asString } from "@/server/validate";

export const POST = route(async (request) => {
  const body = await readJson<{ verificationId?: unknown; code?: unknown }>(
    request,
  );
  await verifyCode(getDb(), {
    verificationId: asString(body.verificationId),
    code: asString(body.code, "인증번호").trim(),
  });
  return NextResponse.json({ ok: true });
});
