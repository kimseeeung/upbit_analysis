import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { changePassword } from "@/server/auth/account-service";
import { readJson, requireApiSession, route } from "@/server/http";
import { asString } from "@/server/validate";

export const POST = route(async (request) => {
  const s = await requireApiSession();
  const b = await readJson<Record<string, unknown>>(request);
  await changePassword(getDb(), {
    userId: s.principal.userId,
    currentSessionId: s.sessionId,
    currentPassword: asString(b.currentPassword, "현재 비밀번호"),
    newPassword: asString(b.newPassword, "새 비밀번호"),
    newPasswordConfirm: asString(b.newPasswordConfirm, "새 비밀번호 확인"),
  });
  return NextResponse.json({ ok: true });
});
