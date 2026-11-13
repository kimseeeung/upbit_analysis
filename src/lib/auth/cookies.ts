/** 세션 쿠키 이름. 쿠키 값은 서버가 발급한 토큰이고 DB에는 해시로 저장한다. */
export const SESSION_COOKIE = "pt_session";
/** 자동 로그인 표시. proxy가 접속할 때마다 쿠키 유효기간을 30일로 다시 늘릴 때 쓴다. */
export const REMEMBER_COOKIE = "pt_remember";
/** 운영 관리자 세션은 회원 세션과 분리한다(자동 로그인 없음, 30분). */
export const ADMIN_SESSION_COOKIE = "pt_admin_session";

export const PERSISTENT_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge?: number;
}

export function sessionCookieOptions(persistent: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.COOKIE_INSECURE !== "1",
    sameSite: "lax",
    path: "/",
    ...(persistent ? { maxAge: PERSISTENT_COOKIE_MAX_AGE } : {}),
  };
}
