/**
 * 세션 규칙 (순수 함수).
 * - 자동 로그인: 30일 유지, 접속할 때마다 30일로 연장 (명세 2.2)
 * - 자동 로그인 아님: 브라우저를 닫으면 끝나는 쿠키 + 서버에서 12시간 슬라이딩
 * 토큰은 기기에만 두고 DB에는 해시만 저장한다.
 */

import { createHash, randomBytes } from "node:crypto";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const PERSISTENT_SESSION_MS = 30 * DAY;
export const BROWSER_SESSION_MS = 12 * HOUR;
/** 접속할 때마다 DB를 쓰지 않도록, 마지막 연장 후 이 시간이 지났을 때만 연장 */
export const SLIDE_THROTTLE_MS = 5 * 60 * 1000;

export function sessionLifetimeMs(persistent: boolean): number {
  return persistent ? PERSISTENT_SESSION_MS : BROWSER_SESSION_MS;
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 토큰은 256비트 난수라 단일 SHA-256으로 충분하다(비밀번호·PIN과 다름). */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionTimes {
  persistent: boolean;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export function isSessionActive(s: SessionTimes, now: Date): boolean {
  return !s.revokedAt && s.expiresAt.getTime() > now.getTime();
}

/**
 * 접속 시 연장. 연장할 필요가 없으면 null.
 * 만료되었거나 로그아웃된 세션은 연장하지 않는다.
 */
export function slideSession(
  s: SessionTimes,
  now: Date,
): { lastSeenAt: Date; expiresAt: Date } | null {
  if (!isSessionActive(s, now)) return null;
  if (now.getTime() - s.lastSeenAt.getTime() < SLIDE_THROTTLE_MS) return null;
  return {
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + sessionLifetimeMs(s.persistent)),
  };
}

/** User-Agent로 "iPhone · Safari" 같은 기기 이름을 만든다 */
export function deviceLabelFromUserAgent(
  ua: string | null | undefined,
): string {
  if (!ua) return "알 수 없는 기기";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "기타";
  const browser = /SamsungBrowser/.test(ua)
    ? "삼성 인터넷"
    : /KAKAOTALK/i.test(ua)
      ? "카카오톡"
      : /Edg\//.test(ua)
        ? "Edge"
        : /CriOS|Chrome\//.test(ua)
          ? "Chrome"
          : /Firefox|FxiOS/.test(ua)
            ? "Firefox"
            : /Safari/.test(ua)
              ? "Safari"
              : "브라우저";
  return `${os} · ${browser}`;
}
