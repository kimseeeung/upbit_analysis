/**
 * 날짜·시간 드롭다운 계산 (순수 함수). 값은 한국 날짜 "YYYY-MM-DD", 시각 "HH:MM"(24시간).
 */

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export interface DateParts {
  y: number;
  m: number;
  d: number;
}

export function parseDate(v: string): DateParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 월을 바꿔 그 달에 없는 날짜가 되면 말일로 맞춘다 (1/31 → 2월 → 2/28) */
export function formatDate({ y, m, d }: DateParts): string {
  return `${y}-${pad(m)}-${pad(Math.min(d, daysInMonth(y, m)))}`;
}

export interface TimeParts {
  pm: boolean;
  /** 1~12 */
  h12: number;
  minute: number;
}

export function parseTime(v: string): TimeParts | null {
  const m = /^(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  return { pm: h >= 12, h12: h % 12 === 0 ? 12 : h % 12, minute: Number(m[2]) };
}

/** 오전 12시 = 00시, 오후 12시 = 12시 */
export function formatTime({ pm, h12, minute }: TimeParts): string {
  const h = (h12 % 12) + (pm ? 12 : 0);
  return `${pad(h)}:${pad(minute)}`;
}

/** 분 목록 (0, 10, 20 …). 지금 값이 목록에 없으면 함께 넣는다 */
export function minuteOptions(step: number, current?: number): number[] {
  const list: number[] = [];
  for (let m = 0; m < 60; m += step) list.push(m);
  if (current !== undefined && !list.includes(current)) list.push(current);
  return list.sort((a, b) => a - b);
}

/** 수업 시간 선택지: 10분 단위 10~120분, 기본 50분 */
export const DURATION_OPTIONS = Array.from(
  { length: 12 },
  (_, i) => (i + 1) * 10,
);
export const DEFAULT_DURATION = 50;
