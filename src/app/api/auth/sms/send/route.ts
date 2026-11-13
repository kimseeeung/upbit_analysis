import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sendVerificationCode } from "@/server/auth/sms-service";
import { readJson, route } from "@/server/http";
import { asSmsPurpose, asString } from "@/server/validate";

export const POST = route(async (request) => {
  const body = await readJson<{ phone?: unknown; purpose?: unknown }>(request);
  const r = await sendVerificationCode(getDb(), {
    phone: asString(body.phone, "전화번호"),
    purpose: asSmsPurpose(body.purpose),
  });
  return NextResponse.json({
    verificationId: r.verificationId,
    expiresAt: r.expiresAt.toISOString(),
    resendAfterSec: r.resendAfterSec,
  });
});
