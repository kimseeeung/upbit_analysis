import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { revokeAllSessions } from "@/server/auth/session-service";
import { clearSessionCookies, requireApiSession, route } from "@/server/http";

/** 모든 기기에서 로그아웃 (이 기기 포함) */
export const POST = route(async () => {
  const s = await requireApiSession();
  await revokeAllSessions(getDb(), s.principal.userId);
  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res);
  return res;
});
