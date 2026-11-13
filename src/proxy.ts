import { NextResponse, type NextRequest } from "next/server";
import { areaForPath, isProtectedArea } from "@/lib/auth/access";
import {
  ADMIN_SESSION_COOKIE,
  REMEMBER_COOKIE,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/cookies";

/**
 * 1차 관문.
 * - 보호 영역에 로그인 쿠키가 없으면 로그인 화면으로 보낸다.
 * - 자동 로그인 기기는 접속할 때마다 쿠키 유효기간을 30일로 다시 늘린다
 *   (서버 세션의 30일 슬라이딩과 맞춘다).
 * 쿠키가 있다고 통과시키는 것은 "낙관적" 검사일 뿐이며, 역할·데이터 권한은
 * 서버(requireArea, requireApiSession)에서 매 요청마다 다시 검사한다.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const area = areaForPath(pathname);

  if (isProtectedArea(area)) {
    const cookieName = area === "admin" ? ADMIN_SESSION_COOKIE : SESSION_COOKIE;
    if (!request.cookies.get(cookieName)?.value) {
      const loginPath = area === "admin" ? "/admin/login" : "/login";
      const url = new URL(loginPath, request.url);
      url.searchParams.set("next", `${pathname}${search}`);
      return NextResponse.redirect(url);
    }
  }

  const res = NextResponse.next();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && request.cookies.get(REMEMBER_COOKIE)?.value === "1") {
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(true));
    res.cookies.set(REMEMBER_COOKIE, "1", sessionCookieOptions(true));
  }
  return res;
}

export const config = {
  matcher: [
    // API·정적 파일 제외 모든 화면
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|ico|webmanifest)$).*)",
  ],
};
