/**
 * 운영 관리자 규칙 (순수 함수, 명세 12).
 */

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** 30분 동안 쓰지 않으면 로그아웃 (12.1) */
export const OPERATOR_IDLE_MS = 30 * MINUTE;
/** 같은 요청이 몰릴 때 DB 쓰기를 줄이려 1분에 한 번만 연장 */
export const OPERATOR_SLIDE_THROTTLE_MS = MINUTE;
/** 2단계 로그인: 비밀번호 확인 후 휴대폰 인증까지 */
export const LOGIN_CHALLENGE_MS = 5 * MINUTE;
/** 관리자 초대 링크 유효기간 */
export const OPERATOR_INVITE_MS = 7 * DAY;

export interface OperatorSessionTimes {
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export function isOperatorSessionActive(
  s: OperatorSessionTimes,
  now: Date,
): boolean {
  return !s.revokedAt && s.expiresAt.getTime() > now.getTime();
}

export function slideOperatorSession(
  s: OperatorSessionTimes,
  now: Date,
): { lastSeenAt: Date; expiresAt: Date } | null {
  if (!isOperatorSessionActive(s, now)) return null;
  if (now.getTime() - s.lastSeenAt.getTime() < OPERATOR_SLIDE_THROTTLE_MS)
    return null;
  return {
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + OPERATOR_IDLE_MS),
  };
}

/** 롤백 PIN: 숫자 6자리, 같은 숫자 반복·연속 금지 */
export function validateRollbackPin(
  pin: string,
): { ok: true } | { ok: false; message: string } {
  if (!/^\d{6}$/.test(pin))
    return { ok: false, message: "롤백 PIN은 숫자 6자리여야 합니다" };
  if (/^(\d)\1{5}$/.test(pin))
    return { ok: false, message: "같은 숫자를 반복한 PIN은 쓸 수 없습니다" };
  const d = [...pin].map(Number);
  const step = d[1] - d[0];
  if (
    (step === 1 || step === -1) &&
    d.every((x, i) => i === 0 || x - d[i - 1] === step)
  )
    return {
      ok: false,
      message: "123456, 654321처럼 연속된 PIN은 쓸 수 없습니다",
    };
  return { ok: true };
}

/**
 * 비활성화해도 활성 관리자가 1명 이상 남는가 (12.2 "최소 1명은 항상 활성").
 * 초대 대기·비활성 관리자는 세지 않는다.
 */
export function canDisableOperator(
  operators: { id: string; status: "INVITED" | "ACTIVE" | "DISABLED" }[],
  targetId: string,
): boolean {
  const target = operators.find((o) => o.id === targetId);
  if (!target || target.status === "DISABLED") return false;
  if (target.status === "INVITED") return true;
  return (
    operators.filter((o) => o.status === "ACTIVE" && o.id !== targetId)
      .length >= 1
  );
}

/**
 * IP 제한 (12.1 권장). 목록이 비면 제한 없음.
 * 항목은 정확한 IP 또는 IPv4 접두사("10.0.0.")로 적는다.
 */
export function isIpAllowed(ip: string | null, allowList: string[]): boolean {
  if (allowList.length === 0) return true;
  if (!ip) return false;
  const clean = ip.replace(/^::ffff:/, "");
  return allowList.some((a) =>
    a.endsWith(".") ? clean.startsWith(a) : clean === a,
  );
}

export function parseIpAllowList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface VersionRow {
  version: string;
  deployedAt: Date;
  isCurrent: boolean;
}

/** "직전 버전으로 롤백": 지금 버전보다 먼저 배포된 버전 중 가장 최근 */
export function previousVersion(versions: VersionRow[]): VersionRow | null {
  const current = versions.find((v) => v.isCurrent);
  if (!current) return null;
  return (
    versions
      .filter(
        (v) =>
          v.version !== current.version &&
          v.deployedAt.getTime() < current.deployedAt.getTime(),
      )
      .sort((a, b) => b.deployedAt.getTime() - a.deployedAt.getTime())[0] ??
    null
  );
}

/** "다시 최신 버전으로": 가장 최근에 배포된 버전. 지금이 최신이면 null */
export function latestVersion(versions: VersionRow[]): VersionRow | null {
  const latest = [...versions].sort(
    (a, b) => b.deployedAt.getTime() - a.deployedAt.getTime(),
  )[0];
  return latest && !latest.isCurrent ? latest : null;
}

/** 롤백 대상 검사 */
export function checkRollbackTarget(
  versions: VersionRow[],
  toVersion: string,
): { ok: true; from: string } | { ok: false; message: string } {
  const current = versions.find((v) => v.isCurrent);
  if (!current)
    return { ok: false, message: "지금 버전 기록이 없어 롤백할 수 없습니다" };
  const target = versions.find((v) => v.version === toVersion);
  if (!target) return { ok: false, message: "배포 기록에 없는 버전입니다" };
  if (target.isCurrent) return { ok: false, message: "이미 지금 버전입니다" };
  return { ok: true, from: current.version };
}
