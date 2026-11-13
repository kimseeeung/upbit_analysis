import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection, type NextResponse } from "next/server";
import { cache } from "react";
import { ADMIN_SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/cookies";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/access";
import { isIpAllowed, parseIpAllowList } from "@/lib/admin/rules";
import { getDb } from "@/lib/db";
import { resolveOperatorSession, type ResolvedOperator } from "./operator-auth";

/** 요청한 IP (프록시 뒤면 X-Forwarded-For 첫 번째) */
export async function requestIp(): Promise<string | null> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null
  );
}

/** IP 제한 (ADMIN_ALLOWED_IPS, 12.1 권장) */
export async function assertAdminIp() {
  const list = parseIpAllowList(process.env.ADMIN_ALLOWED_IPS);
  if (!isIpAllowed(await requestIp(), list))
    throw new ForbiddenError("허용되지 않은 접속 위치입니다");
}

export const getCurrentOperator = cache(
  async (): Promise<ResolvedOperator | null> => {
    await connection();
    const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
    return resolveOperatorSession(getDb(), token);
  },
);

/** 운영 관리자 API: 매 요청 세션·IP 검사 */
export async function requireApiOperator(): Promise<ResolvedOperator> {
  await assertAdminIp();
  const op = await getCurrentOperator();
  if (!op) throw new UnauthorizedError();
  return op;
}

/** 운영 관리자 화면 */
export async function requireOperatorPage(): Promise<ResolvedOperator> {
  await assertAdminIp();
  const op = await getCurrentOperator();
  if (!op) redirect("/admin/login");
  return op;
}

/** 자동 로그인 없음: 브라우저를 닫으면 끝나는 쿠키. 서버에서 30분 미사용 만료 */
export function setAdminCookie(res: NextResponse, token: string) {
  res.cookies.set(ADMIN_SESSION_COOKIE, token, sessionCookieOptions(false));
}
export function clearAdminCookie(res: NextResponse) {
  res.cookies.delete(ADMIN_SESSION_COOKIE);
}
