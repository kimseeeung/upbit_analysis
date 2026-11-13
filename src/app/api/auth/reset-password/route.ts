import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { resetPassword } from "@/server/auth/account-service";
import { readJson, route } from "@/server/http";
import { asString } from "@/server/validate";

export const POST = route(async (request) => {
  const b = await readJson<Record<string, unknown>>(request);
  await resetPassword(getDb(), {
    loginId: asString(b.loginId, "아이디"),
    phone: asString(b.phone, "전화번호"),
    verificationId: asString(b.verificationId),
    newPassword: asString(b.newPassword, "새 비밀번호"),
    newPasswordConfirm: asString(b.newPasswordConfirm, "새 비밀번호 확인"),
  });
  return NextResponse.json({ ok: true });
});
