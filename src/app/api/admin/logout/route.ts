import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/auth/cookies";
import { getDb } from "@/lib/db";
import { route } from "@/server/http";
import { clearAdminCookie } from "@/server/admin/http";
import { revokeOperatorSession } from "@/server/admin/operator-auth";

export const POST = route(async () => {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (token) await revokeOperatorSession(getDb(), token);
  const res = NextResponse.json({ ok: true });
  clearAdminCookie(res);
  return res;
});
