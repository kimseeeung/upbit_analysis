import "server-only";

import { redirect } from "next/navigation";
import {
  ForbiddenError,
  canAccessArea,
  homePathFor,
  type Area,
  type Principal,
} from "@/lib/auth/access";
import { getDb } from "@/lib/db";
import { getCurrentSession } from "@/server/auth/current";
import { getTermsNeedingReconsent } from "@/server/auth/terms-service";

/**
 * 현재 요청의 로그인 주체. 회원 세션만 처리한다.
 * 운영 관리자 세션은 M10에서 추가한다.
 */
export async function getCurrentPrincipal(): Promise<Principal | null> {
  return (await getCurrentSession())?.principal ?? null;
}

/**
 * 페이지 맨 앞에서 호출한다.
 * - 로그인 안 했으면 로그인 화면으로
 * - 다른 역할의 영역이면 자기 홈으로
 * - 바뀐 필수 약관에 다시 동의하지 않았으면 재동의 화면으로 (명세 1.3)
 */
export async function requireArea(area: Area): Promise<Principal> {
  const principal = await getCurrentPrincipal();
  if (!principal) {
    redirect(area === "admin" ? "/admin/login" : "/login");
  }
  if (!canAccessArea(principal, area)) {
    if (area === "admin") throw new ForbiddenError();
    redirect(homePathFor(principal));
  }
  if (principal.kind === "user") {
    // 탈퇴 신청 중인 계정은 정지 상태: 탈퇴 취소 화면만 (2.4)
    if ((await getCurrentSession())?.userStatus === "WITHDRAWING")
      redirect("/withdraw/cancel");
    const pending = await getTermsNeedingReconsent(getDb(), principal.userId);
    if (pending.length > 0) redirect("/terms/reconsent");
  }
  return principal;
}

/** 로그인만 확인 (약관 재동의 화면 등) */
export async function requireUser() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}
