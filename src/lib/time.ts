/**
 * 한국 시간(Asia/Seoul) 유틸.
 *
 * - DB에는 UTC(Date)로 저장하고, 계산·표시는 한국 시간 기준으로 한다.
 * - 한국은 1988년 이후 일광절약시간이 없어 UTC+9 고정이다.
 *   그래서 서버의 TZ 설정과 관계없이 같은 결과를 내도록 오프셋으로 계산한다.
 */

export const KST_TIME_ZONE = "Asia/Seoul";
export const KST_OFFSET_MINUTES = 9 * 60;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const KST_OFFSET_MS = KST_OFFSET_MINUTES * MINUTE_MS;

export interface KstParts {
  year: number;
  /** 1~12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0(일)~6(토) */
  weekday: number;
}

function assertValidDate(date: Date): void {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("유효하지 않은 날짜입니다");
  }
}

/** 시각을 한국 시간 기준 연·월·일·시·분·초·요일로 나눈다. */
export function toKstParts(date: Date): KstParts {
  assertValidDate(date);
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay(),
  };
}

/** 한국 시간 기준 날짜·시각으로 UTC 시점(Date)을 만든다. month는 1~12. */
export function kstDateTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const utcMs =
    Date.UTC(year, month - 1, day, hour, minute, second) - KST_OFFSET_MS;
  const result = new Date(utcMs);
  const parts = toKstParts(result);
  if (
    parts.year !== year ||
    parts.month !== month ||
    parts.day !== day ||
    parts.hour !== hour ||
    parts.minute !== minute ||
    parts.second !== second
  ) {
    throw new RangeError(
      `존재하지 않는 날짜·시각입니다: ${year}-${month}-${day} ${hour}:${minute}:${second}`,
    );
  }
  return result;
}

/** 한국 날짜 하루의 시작(00:00 KST) 시점. */
export function startOfKstDay(date: Date): Date {
  const { year, month, day } = toKstParts(date);
  return kstDateTime(year, month, day);
}

/** 한국 날짜 기준으로 n일을 더한다(시각은 유지). */
export function addKstDays(date: Date, days: number): Date {
  assertValidDate(date);
  return new Date(date.getTime() + days * DAY_MS);
}

/** 두 시점의 한국 날짜 차이(일). b가 a보다 나중이면 양수. */
export function diffKstCalendarDays(a: Date, b: Date): number {
  return Math.round(
    (startOfKstDay(b).getTime() - startOfKstDay(a).getTime()) / DAY_MS,
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 한국 날짜 키 "YYYY-MM-DD". */
export function toKstDateKey(date: Date): string {
  const { year, month, day } = toKstParts(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** "YYYY-MM-DD"(한국 날짜)를 그날 00:00 KST 시점으로 바꾼다. */
export function parseKstDateKey(key: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) {
    throw new RangeError(`날짜 형식이 아닙니다(YYYY-MM-DD): ${key}`);
  }
  return kstDateTime(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** "HH:mm" 한국 시각 문자열. */
export function toKstTimeString(date: Date): string {
  const { hour, minute } = toKstParts(date);
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** 한국 날짜(dateKey)와 "HH:mm"을 합쳐 UTC 시점으로 바꾼다. */
export function combineKstDateAndTime(dateKey: string, time: string): Date {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) {
    throw new RangeError(`시각 형식이 아닙니다(HH:mm): ${time}`);
  }
  const day = parseKstDateKey(dateKey);
  const { year, month, day: d } = toKstParts(day);
  return kstDateTime(year, month, d, Number(match[1]), Number(match[2]));
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 화면 표시용: "11/13 20:10" */
export function formatKstShort(date: Date): string {
  const { month, day } = toKstParts(date);
  return `${month}/${day} ${toKstTimeString(date)}`;
}

/** 화면 표시용: "2026-11-13 (금) 20:10" */
export function formatKstDateTime(date: Date): string {
  const { weekday } = toKstParts(date);
  return `${toKstDateKey(date)} (${WEEKDAY_KO[weekday]}) ${toKstTimeString(date)}`;
}

/** 화면 표시용: "11월 13일" (안내 문구의 "○월 ○일") */
export function formatKstMonthDay(date: Date): string {
  const { month, day } = toKstParts(date);
  return `${month}월 ${day}일`;
}
