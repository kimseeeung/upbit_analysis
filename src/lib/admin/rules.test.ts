import { describe, expect, it } from "vitest";
import {
  OPERATOR_IDLE_MS,
  canDisableOperator,
  checkRollbackTarget,
  isIpAllowed,
  latestVersion,
  parseIpAllowList,
  previousVersion,
  slideOperatorSession,
  validateRollbackPin,
} from "./rules";
import {
  OPERATOR_LOCK,
  type LockState,
  isLocked,
  registerFailure,
  registerSuccess,
} from "@/lib/auth/lockout";

const t0 = new Date("2026-11-13T03:00:00Z");
const min = (n: number) => new Date(t0.getTime() + n * 60_000);

describe("롤백 PIN 5회 오류 30분 잠금 (12.3)", () => {
  it("4번 틀려도 잠기지 않고 5번째에 30분 잠금", () => {
    let s = { failCount: 0, lockedUntil: null as Date | null };
    for (let i = 0; i < 4; i++) s = registerFailure(s, t0, OPERATOR_LOCK);
    expect(isLocked(s, t0)).toBe(false);
    s = registerFailure(s, t0, OPERATOR_LOCK);
    expect(s.lockedUntil).toEqual(min(30));
    expect(isLocked(s, min(29))).toBe(true);
    expect(isLocked(s, min(30))).toBe(false);
  });
  it("잠금이 풀린 뒤에는 다시 1부터 센다, 성공하면 초기화", () => {
    let s: LockState = { failCount: 5, lockedUntil: min(30) };
    s = registerFailure(s, min(31), OPERATOR_LOCK);
    expect(s).toEqual({ failCount: 1, lockedUntil: null });
    expect(registerSuccess()).toEqual({ failCount: 0, lockedUntil: null });
  });
});

describe("롤백 PIN 형식", () => {
  it.each([
    ["482913", true],
    ["12345", false],
    ["1234567", false],
    ["abcdef", false],
    ["111111", false],
    ["123456", false],
    ["654321", false],
    ["135790", true],
  ])("%s → %s", (pin, ok) => {
    expect(validateRollbackPin(pin).ok).toBe(ok);
  });
});

describe("관리자 최소 1명 유지 (12.2)", () => {
  it("활성 관리자가 혼자면 비활성화할 수 없다", () => {
    expect(
      canDisableOperator(
        [
          { id: "a", status: "ACTIVE" },
          { id: "b", status: "INVITED" },
          { id: "c", status: "DISABLED" },
        ],
        "a",
      ),
    ).toBe(false);
  });
  it("다른 활성 관리자가 있으면 가능 (자기 자신도)", () => {
    const ops = [
      { id: "a", status: "ACTIVE" as const },
      { id: "b", status: "ACTIVE" as const },
    ];
    expect(canDisableOperator(ops, "a")).toBe(true);
    expect(canDisableOperator(ops, "b")).toBe(true);
  });
  it("초대 대기는 언제나 취소 가능, 이미 비활성이면 불가", () => {
    const ops = [
      { id: "a", status: "ACTIVE" as const },
      { id: "b", status: "INVITED" as const },
      { id: "c", status: "DISABLED" as const },
    ];
    expect(canDisableOperator(ops, "b")).toBe(true);
    expect(canDisableOperator(ops, "c")).toBe(false);
    expect(canDisableOperator(ops, "x")).toBe(false);
  });
});

describe("관리자 세션 30분 미사용 시 끝 (12.1)", () => {
  it("1분 지나 쓰면 30분 연장, 만료 후엔 연장 없음", () => {
    const s = { lastSeenAt: t0, expiresAt: min(30), revokedAt: null };
    expect(slideOperatorSession(s, min(0.5))).toBeNull();
    expect(slideOperatorSession(s, min(10))).toEqual({
      lastSeenAt: min(10),
      expiresAt: new Date(min(10).getTime() + OPERATOR_IDLE_MS),
    });
    expect(slideOperatorSession(s, min(30))).toBeNull();
  });
});

describe("IP 제한", () => {
  it("목록이 없으면 모두 허용, 있으면 정확한 IP·접두사만", () => {
    expect(isIpAllowed("1.2.3.4", [])).toBe(true);
    const list = parseIpAllowList(" 10.0.0., 203.0.113.7 ,");
    expect(list).toEqual(["10.0.0.", "203.0.113.7"]);
    expect(isIpAllowed("10.0.0.15", list)).toBe(true);
    expect(isIpAllowed("::ffff:203.0.113.7", list)).toBe(true);
    expect(isIpAllowed("203.0.113.70", list)).toBe(false);
    expect(isIpAllowed(null, list)).toBe(false);
  });
});

describe("롤백 대상", () => {
  const v = [
    { version: "1.0.0", deployedAt: min(-300), isCurrent: false },
    { version: "1.1.0", deployedAt: min(-200), isCurrent: false },
    { version: "1.2.0", deployedAt: min(-100), isCurrent: true },
  ];
  it("직전 버전은 지금 버전 바로 전", () => {
    expect(previousVersion(v)?.version).toBe("1.1.0");
    expect(latestVersion(v)).toBeNull();
  });
  it("롤백한 뒤에는 최신으로 돌아갈 수 있다", () => {
    const rolled = v.map((x) => ({ ...x, isCurrent: x.version === "1.1.0" }));
    expect(latestVersion(rolled)?.version).toBe("1.2.0");
    expect(previousVersion(rolled)?.version).toBe("1.0.0");
  });
  it("대상 검사", () => {
    expect(checkRollbackTarget(v, "1.0.0")).toEqual({
      ok: true,
      from: "1.2.0",
    });
    expect(checkRollbackTarget(v, "1.2.0").ok).toBe(false);
    expect(checkRollbackTarget(v, "9.9.9").ok).toBe(false);
    expect(checkRollbackTarget([], "1.0.0").ok).toBe(false);
  });
});
