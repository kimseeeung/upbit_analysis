/**
 * 연속 실패 잠금 (순수 함수).
 * - 로그인: 5회 연속 실패 시 10분 (명세 2.1)
 * - PIN: 5회 오류 시 잠금 → 본인인증 후 재설정 (명세 5.1) → 기간 없음
 * - 운영 관리자: 5회 실패 30분 (명세 12.1, 12.3)
 */

export interface LockState {
  failCount: number;
  lockedUntil: Date | null;
}

export interface LockPolicy {
  maxFails: number;
  /** null이면 시간으로 풀리지 않음(재설정해야 풀림) */
  lockMs: number | null;
}

const MINUTE = 60 * 1000;

export const LOGIN_LOCK: LockPolicy = { maxFails: 5, lockMs: 10 * MINUTE };
export const PIN_LOCK: LockPolicy = { maxFails: 5, lockMs: null };
export const OPERATOR_LOCK: LockPolicy = { maxFails: 5, lockMs: 30 * MINUTE };

/** 재설정 전까지 풀리지 않는 잠금 표시용 아주 먼 시각 */
export const LOCKED_FOREVER = new Date("9999-12-31T00:00:00Z");

export function isLocked(state: LockState, now: Date): boolean {
  return !!state.lockedUntil && state.lockedUntil.getTime() > now.getTime();
}

/** 실패를 하나 더한다. 잠금이 시간으로 풀린 뒤의 실패는 1부터 다시 센다. */
export function registerFailure(
  state: LockState,
  now: Date,
  policy: LockPolicy,
): LockState {
  const expired =
    !!state.lockedUntil && state.lockedUntil.getTime() <= now.getTime();
  const failCount = (expired ? 0 : state.failCount) + 1;
  if (failCount >= policy.maxFails) {
    return {
      failCount,
      lockedUntil:
        policy.lockMs === null
          ? LOCKED_FOREVER
          : new Date(now.getTime() + policy.lockMs),
    };
  }
  return { failCount, lockedUntil: null };
}

export function registerSuccess(): LockState {
  return { failCount: 0, lockedUntil: null };
}

/** 남은 잠금 시간(분, 올림). 잠겨 있지 않으면 0 */
export function remainingLockMinutes(state: LockState, now: Date): number {
  if (!isLocked(state, now)) return 0;
  return Math.ceil((state.lockedUntil!.getTime() - now.getTime()) / MINUTE);
}
