import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { getDb } from "@/lib/db";
import { revokeSessionByToken } from "@/server/auth/session-service";
import { clearSessionCookies, route } from "@/server/http";

export const POST = route(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await revokeSessionByToken(getDb(), token);
  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res);
  return res;
});
