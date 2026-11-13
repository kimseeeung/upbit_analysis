import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ForbiddenError,
  canAccessArea,
  type Area,
  type Principal,
} from "@/lib/auth/access";
import { ADMIN_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/auth/cookies";

/**
 * 현재 요청의 로그인 주체.
 * M0에서는 뼈대만 있고 항상 null을 돌려준다.
 * M1에서 쿠키 토큰 → 해시 → Session 조회(30일 슬라이딩)로 구현한다.
 */
export async function getCurrentPrincipal(): Promise<Principal | null> {
  const store = await cookies();
  const userToken = store.get(SESSION_COOKIE)?.value;
  const adminToken = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (!userToken && !adminToken) return null;
  // TODO(M1): 세션 조회
  return null;
}

/**
 * 페이지·Server Function 맨 앞에서 호출한다.
 * 로그인 안 했으면 로그인 화면으로 보내고, 권한이 없으면 ForbiddenError(403).
 */
export async function requireArea(area: Area): Promise<Principal> {
  const principal = await getCurrentPrincipal();
  if (!principal) {
    redirect(area === "admin" ? "/admin/login" : "/login");
  }
  if (!canAccessArea(principal, area)) {
    throw new ForbiddenError();
  }
  return principal;
}
