/**
 * 이용권 일시정지 (명세 3.3). 순수 함수. 날짜는 한국 날짜 키("YYYY-MM-DD"), 양 끝 포함.
 * - 정지한 일수만큼 만료일 자동 연장
 * - 일찍 재개하면 실제로 쉰 일수만 연장
 * - 한도: 1회 최대 일수, 이용권당 횟수 (수강 규칙, 기본 30일·2회)
 */

const DAY = 24 * 60 * 60 * 1000;

function toUtc(key: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new RangeError(`날짜 형식이 아닙니다: ${key}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 양 끝을 포함한 일수 (end < start면 0) */
export function inclusiveDays(start: string, end: string): number {
  const d = Math.round((toUtc(end) - toUtc(start)) / DAY) + 1;
  return Math.max(0, d);
}

export function addDays(key: string, days: number): string {
  return fromUtc(toUtc(key) + days * DAY);
}

export interface PauseLimits {
  pauseMaxDays: number;
  pauseMaxCount: number;
}

export type PauseCheck =
  { ok: true; days: number } | { ok: false; message: string };

/**
 * 일시정지 신청 검사.
 * @param usedCount 이 이용권에서 이미 쓴(승인·조기 재개) 일시정지 횟수
 */
export function checkPauseRequest(input: {
  startDate: string;
  endDate: string;
  today: string;
  passStartDate: string;
  passEndDate: string;
  usedCount: number;
  limits: PauseLimits;
}): PauseCheck {
  const { startDate, endDate, today, limits } = input;
  if (endDate < startDate)
    return { ok: false, message: "종료일은 시작일 뒤여야 합니다" };
  if (startDate < today)
    return { ok: false, message: "지난 날짜부터는 정지할 수 없습니다" };
  if (startDate < input.passStartDate || startDate > input.passEndDate) {
    return { ok: false, message: "이용권 기간 안에서 시작해야 합니다" };
  }
  const days = inclusiveDays(startDate, endDate);
  if (days > limits.pauseMaxDays) {
    return {
      ok: false,
      message: `한 번에 최대 ${limits.pauseMaxDays}일까지 정지할 수 있습니다`,
    };
  }
  if (input.usedCount >= limits.pauseMaxCount) {
    return {
      ok: false,
      message: `이 이용권은 일시정지를 ${limits.pauseMaxCount}회까지 쓸 수 있습니다`,
    };
  }
  return { ok: true, days };
}

/** 정지 승인: 정지한 일수만큼 만료일 연장 */
export function extendedEndDate(
  passEndDate: string,
  pauseStart: string,
  pauseEnd: string,
): string {
  return addDays(passEndDate, inclusiveDays(pauseStart, pauseEnd));
}

/**
 * 조기 재개: 재개일 전날까지만 쉰 것으로 본다.
 * 실제로 쉰 일수만 연장하도록, 승인 때 늘린 만료일에서 쓰지 않은 일수를 뺀다.
 * 시작 전에 재개(취소)하면 쉰 날 0일.
 */
export function earlyResume(input: {
  pauseStart: string;
  plannedEnd: string;
  resumeDate: string;
  currentPassEndDate: string;
}): {
  actualEnd: string | null;
  restedDays: number;
  unusedDays: number;
  newPassEndDate: string;
} {
  const planned = inclusiveDays(input.pauseStart, input.plannedEnd);
  const lastRested = addDays(input.resumeDate, -1);
  const actualEnd =
    lastRested < input.pauseStart
      ? null
      : lastRested < input.plannedEnd
        ? lastRested
        : input.plannedEnd;
  const rested = actualEnd ? inclusiveDays(input.pauseStart, actualEnd) : 0;
  const unused = planned - rested;
  return {
    actualEnd,
    restedDays: rested,
    unusedDays: unused,
    newPassEndDate: addDays(input.currentPassEndDate, -unused),
  };
}

/** 오늘 정지 중인가 */
export function isPausedToday(
  today: string,
  start: string,
  end: string,
): boolean {
  return start <= today && today <= end;
}
