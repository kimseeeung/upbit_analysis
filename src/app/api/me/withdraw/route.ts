import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  requestWithdraw,
  withdrawPreview,
} from "@/server/account/withdraw-service";
import {
  clearSessionCookies,
  readJson,
  requireApiSession,
  route,
} from "@/server/http";
import { asOptionalString } from "@/server/validate";

/** 탈퇴 전 안내 */
export const GET = route(async () => {
  const s = await requireApiSession();
  return NextResponse.json(await withdrawPreview(getDb(), s.principal.userId));
});

/** 탈퇴 신청: 비밀번호 재입력 또는 본인인증 */
export const POST = route(async (request) => {
  const s = await requireApiSession();
  const b = await readJson<Record<string, unknown>>(request);
  const r = await requestWithdraw(getDb(), {
    userId: s.principal.userId,
    password: asOptionalString(b.password) ?? undefined,
    verificationId: asOptionalString(b.verificationId) ?? undefined,
    reason: asOptionalString(b.reason) ?? undefined,
  });
  const res = NextResponse.json({
    deleteScheduledAt: r.deleteScheduledAt.toISOString(),
    message: r.message,
  });
  clearSessionCookies(res);
  return res;
});
