import { describe, expect, it } from "vitest";
import {
  BROWSER_SESSION_MS,
  PERSISTENT_SESSION_MS,
  deviceLabelFromUserAgent,
  hashSessionToken,
  isSessionActive,
  newSessionToken,
  slideSession,
} from "./session-rules";

const DAY = 24 * 60 * 60 * 1000;
const t0 = new Date("2026-11-13T00:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

function persistentSession() {
  return {
    persistent: true,
    lastSeenAt: t0,
    expiresAt: at(PERSISTENT_SESSION_MS),
    revokedAt: null as Date | null,
  };
}

describe("세션 30일 슬라이딩", () => {
  it("30일 안에 접속하면 그 시점부터 30일로 연장된다", () => {
    const s = persistentSession();
    const now = at(20 * DAY);
    expect(slideSession(s, now)).toEqual({
      lastSeenAt: now,
      expiresAt: at(50 * DAY),
    });
  });

  it("계속 접속하면 계속 유지된다", () => {
    let s = persistentSession();
    for (let day = 25; day <= 25 * 6; day += 25) {
      const now = at(day * DAY);
      expect(isSessionActive(s, now)).toBe(true);
      s = { ...s, ...slideSession(s, now)! };
    }
    expect(s.expiresAt).toEqual(at((150 + 30) * DAY));
  });

  it("30일 동안 접속하지 않으면 만료된다", () => {
    const s = persistentSession();
    expect(isSessionActive(s, at(30 * DAY - 1))).toBe(true);
    expect(isSessionActive(s, at(30 * DAY))).toBe(false);
    expect(slideSession(s, at(31 * DAY))).toBeNull();
  });

  it("로그아웃된 세션은 연장하지 않는다", () => {
    const s = { ...persistentSession(), revokedAt: at(DAY) };
    expect(isSessionActive(s, at(2 * DAY))).toBe(false);
    expect(slideSession(s, at(2 * DAY))).toBeNull();
  });

  it("5분 안의 연속 접속은 DB를 쓰지 않는다", () => {
    const s = persistentSession();
    expect(slideSession(s, at(4 * 60 * 1000))).toBeNull();
    expect(slideSession(s, at(5 * 60 * 1000))).not.toBeNull();
  });

  it("자동 로그인이 아니면 12시간 슬라이딩", () => {
    const s = {
      persistent: false,
      lastSeenAt: t0,
      expiresAt: at(BROWSER_SESSION_MS),
      revokedAt: null,
    };
    const now = at(6 * 60 * 60 * 1000);
    expect(slideSession(s, now)?.expiresAt).toEqual(at(18 * 60 * 60 * 1000));
    expect(isSessionActive(s, at(BROWSER_SESSION_MS))).toBe(false);
  });
});

describe("토큰", () => {
  it("매번 다른 토큰, 해시는 같은 입력에 같은 값", () => {
    const a = newSessionToken();
    const b = newSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashSessionToken(a)).toBe(hashSessionToken(a));
    expect(hashSessionToken(a)).not.toContain(a);
  });
});

describe("기기 이름", () => {
  it.each([
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "iPhone · Safari",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36",
      "Android · 삼성 인터넷",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      "Windows · Chrome",
    ],
    [null, "알 수 없는 기기"],
  ])("%s", (ua, label) => {
    expect(deviceLabelFromUserAgent(ua)).toBe(label);
  });
});
