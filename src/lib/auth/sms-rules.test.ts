import { describe, expect, it } from "vitest";
import { kstDateTime } from "@/lib/time";
import {
  canConsumeVerification,
  checkCanSend,
  generateSmsCode,
  precheckAttempt,
} from "./sms-rules";

const now = kstDateTime(2026, 11, 13, 15, 0);
const sec = (s: number) => new Date(now.getTime() + s * 1000);

describe("인증번호 발송 제한", () => {
  it("처음은 보낼 수 있다", () => {
    expect(checkCanSend([], now).ok).toBe(true);
  });

  it("30초 안에는 재발송 불가", () => {
    const r = checkCanSend([sec(-10)], now);
    expect(r).toMatchObject({
      ok: false,
      reason: "COOLDOWN",
      retryAfterSec: 20,
    });
    expect(checkCanSend([sec(-30)], now).ok).toBe(true);
  });

  it("한국 날짜 기준 하루 5회", () => {
    const sent = [1, 2, 3, 4, 5].map((h) => kstDateTime(2026, 11, 13, h, 0));
    expect(checkCanSend(sent, now)).toMatchObject({
      ok: false,
      reason: "DAILY_LIMIT",
    });
    // 다음 날 00:00 KST부터 다시 가능
    expect(checkCanSend(sent, kstDateTime(2026, 11, 14, 0, 0)).ok).toBe(true);
    // 전날 기록은 세지 않는다 (UTC로는 같은 날이어도)
    const yesterday = [1, 2, 3, 4, 5].map((h) =>
      kstDateTime(2026, 11, 12, 18 + h - 1, 0),
    );
    expect(checkCanSend(yesterday, now).ok).toBe(true);
  });
});

describe("인증번호 확인", () => {
  const base = {
    expiresAt: sec(180),
    attempts: 0,
    verifiedAt: null,
    consumedAt: null,
  };

  it("3분 안이면 시도 가능", () => {
    expect(precheckAttempt(base, sec(179)).ok).toBe(true);
    expect(precheckAttempt(base, sec(180))).toMatchObject({
      reason: "EXPIRED",
    });
  });

  it("5회 틀리면 새 번호를 받아야 한다", () => {
    expect(precheckAttempt({ ...base, attempts: 4 }, now).ok).toBe(true);
    expect(precheckAttempt({ ...base, attempts: 5 }, now)).toMatchObject({
      reason: "TOO_MANY",
    });
  });

  it("인증 결과는 30분 안에 한 번만 쓸 수 있다", () => {
    const verified = { ...base, verifiedAt: now };
    expect(canConsumeVerification(verified, sec(30 * 60))).toBe(true);
    expect(canConsumeVerification(verified, sec(30 * 60 + 1))).toBe(false);
    expect(canConsumeVerification({ ...verified, consumedAt: now }, now)).toBe(
      false,
    );
    expect(canConsumeVerification(base, now)).toBe(false);
  });

  it("코드는 6자리 숫자", () => {
    for (let i = 0; i < 50; i++) expect(generateSmsCode()).toMatch(/^\d{6}$/);
  });
});
