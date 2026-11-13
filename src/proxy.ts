import { NextResponse, type NextRequest } from "next/server";
import { areaForPath, isProtectedArea } from "@/lib/auth/access";
import { ADMIN_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/auth/cookies";

/**
 * 1차 관문: 로그인 쿠키가 없으면 로그인 화면으로 보낸다.
 * 쿠키가 있다고 통과시키는 것은 "낙관적" 검사일 뿐이며, 역할·데이터 권한은
 * 서버(requireArea 등)에서 매 요청마다 다시 검사한다.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const area = areaForPath(pathname);
  if (!isProtectedArea(area)) return NextResponse.next();

  const cookieName = area === "admin" ? ADMIN_SESSION_COOKIE : SESSION_COOKIE;
  if (request.cookies.get(cookieName)?.value) return NextResponse.next();

  const loginPath = area === "admin" ? "/admin/login" : "/login";
  const url = new URL(loginPath, request.url);
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/t/:path*", "/s/:path*", "/c/:path*", "/admin/:path*"],
};
