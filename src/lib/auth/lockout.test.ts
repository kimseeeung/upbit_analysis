import { describe, expect, it } from "vitest";
import {
  LOCKED_FOREVER,
  LOGIN_LOCK,
  OPERATOR_LOCK,
  PIN_LOCK,
  isLocked,
  registerFailure,
  registerSuccess,
  remainingLockMinutes,
  type LockState,
} from "./lockout";

const t0 = new Date("2026-11-13T01:00:00Z");
const min = (n: number) => new Date(t0.getTime() + n * 60_000);

function failTimes(n: number, policy = LOGIN_LOCK, at = t0): LockState {
  let s: LockState = { failCount: 0, lockedUntil: null };
  for (let i = 0; i < n; i++) s = registerFailure(s, at, policy);
  return s;
}

describe("로그인 잠금 (5회 연속 실패 → 10분)", () => {
  it("4회까지는 잠기지 않는다", () => {
    const s = failTimes(4);
    expect(s).toEqual({ failCount: 4, lockedUntil: null });
    expect(isLocked(s, t0)).toBe(false);
  });

  it("5회째 실패하면 10분 잠긴다", () => {
    const s = failTimes(5);
    expect(s.lockedUntil).toEqual(min(10));
    expect(isLocked(s, t0)).toBe(true);
    expect(isLocked(s, min(9.99))).toBe(true);
    expect(remainingLockMinutes(s, min(3))).toBe(7);
  });

  it("10분이 지나면 풀리고, 다음 실패는 1회부터 다시 센다", () => {
    const s = failTimes(5);
    expect(isLocked(s, min(10))).toBe(false);
    expect(remainingLockMinutes(s, min(10))).toBe(0);
    const next = registerFailure(s, min(11), LOGIN_LOCK);
    expect(next).toEqual({ failCount: 1, lockedUntil: null });
  });

  it("성공하면 실패 횟수를 지운다", () => {
    expect(registerSuccess()).toEqual({ failCount: 0, lockedUntil: null });
  });
});

describe("PIN 잠금 (5회 오류 → 재설정 전까지)", () => {
  it("시간으로 풀리지 않는다", () => {
    const s = failTimes(5, PIN_LOCK);
    expect(s.lockedUntil).toEqual(LOCKED_FOREVER);
    expect(isLocked(s, new Date("2099-01-01T00:00:00Z"))).toBe(true);
  });
});

describe("운영 관리자 잠금 (5회 → 30분)", () => {
  it("30분 잠긴다", () => {
    expect(failTimes(5, OPERATOR_LOCK).lockedUntil).toEqual(min(30));
  });
});
