import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import {
  REMEMBER_COOKIE,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/cookies";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/access";
import { getCurrentSession } from "@/server/auth/current";
import type { ResolvedSession } from "@/server/auth/session-service";
import { AppError } from "@/server/errors";

export function jsonError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

/** 다른 사이트에서 보낸 변경 요청을 막는다 (Origin이 있으면 같은 호스트여야 함) */
function assertSameOrigin(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ForbiddenError("잘못된 요청입니다");
  }
  if (host && originHost !== host)
    throw new ForbiddenError("잘못된 요청입니다");
}

export async function readJson<T>(request: Request): Promise<T> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    throw new AppError("BAD_REQUEST", "잘못된 요청입니다", 415);
  }
  try {
    return (await request.json()) as T;
  } catch {
    throw new AppError("BAD_REQUEST", "잘못된 요청입니다");
  }
}

type Handler<C> = (request: Request, ctx: C) => Promise<Response>;

/** Route Handler 공통: 오류를 JSON으로 바꾸고 같은 출처를 검사한다 */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (request, ctx) => {
    try {
      assertSameOrigin(request);
      return await handler(request, ctx);
    } catch (e) {
      // Next.js 내부 신호(프리렌더 중단, redirect 등)는 그대로 넘긴다
      unstable_rethrow(e);
      if (e instanceof AppError)
        return jsonError(e.code, e.message, e.status, e.details);
      if (e instanceof UnauthorizedError)
        return jsonError("UNAUTHORIZED", e.message, 401);
      if (e instanceof ForbiddenError)
        return jsonError("FORBIDDEN", e.message, 403);
      console.error("[api] 처리하지 못한 오류", e);
      return jsonError("INTERNAL", "잠시 후 다시 시도해 주세요", 500);
    }
  };
}

/** API에서 로그인한 회원 세션을 요구한다. 서버에서 매 요청 검사. */
export async function requireApiSession(
  roles?: Array<"TRAINER" | "STUDENT" | "CENTER_ADMIN">,
  options: { allowWithdrawing?: boolean } = {},
): Promise<ResolvedSession> {
  const session = await getCurrentSession();
  if (!session) throw new UnauthorizedError();
  if (roles && !roles.includes(session.principal.role))
    throw new ForbiddenError();
  // 탈퇴 신청 중인 계정은 정지 상태 (탈퇴 취소·로그아웃만)
  if (session.userStatus === "WITHDRAWING" && !options.allowWithdrawing) {
    throw new ForbiddenError(
      "탈퇴 신청 중인 계정입니다. 탈퇴를 취소한 뒤 이용할 수 있습니다",
    );
  }
  return session;
}

export function setSessionCookies(
  res: NextResponse,
  token: string,
  persistent: boolean,
) {
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(persistent));
  if (persistent) {
    res.cookies.set(REMEMBER_COOKIE, "1", sessionCookieOptions(true));
  } else {
    res.cookies.delete(REMEMBER_COOKIE);
  }
}

export function clearSessionCookies(res: NextResponse) {
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(REMEMBER_COOKIE);
}
