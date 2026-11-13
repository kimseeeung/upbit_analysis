/**
 * 근무 가능 시간·빈 시간·시간 겹침·반복 예약·각종 기한 (명세 4). 순수 함수.
 * 날짜·시각은 한국 시간 기준으로 해석한다.
 */

import {
  addKstDays,
  combineKstDateAndTime,
  parseKstDateKey,
  toKstDateKey,
  toKstParts,
} from "@/lib/time";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface AvailabilityRuleInput {
  /** 0(일)~6(토) */
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface AvailabilityExceptionInput {
  date: string;
  isOff: boolean;
  startTime?: string | null;
  endTime?: string | null;
}

export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export function isValidTime(t: string): boolean {
  return TIME_RE.test(t);
}

function timeOn(dateKey: string, time: string): Date {
  if (time === "24:00")
    return parseKstDateKey(
      toKstDateKey(addKstDays(parseKstDateKey(dateKey), 1)),
    );
  return combineKstDateAndTime(dateKey, time);
}

/** 한 날짜의 근무 시간대. 예외일이 있으면 예외일을 따른다 */
export function workingRangesOn(
  dateKey: string,
  rules: readonly AvailabilityRuleInput[],
  exceptions: readonly AvailabilityExceptionInput[],
): TimeRange[] {
  const ex = exceptions.find((e) => e.date === dateKey);
  if (ex) {
    if (ex.isOff || !ex.startTime || !ex.endTime) return [];
    return [
      {
        start: timeOn(dateKey, ex.startTime),
        end: timeOn(dateKey, ex.endTime),
      },
    ];
  }
  const weekday = toKstParts(parseKstDateKey(dateKey)).weekday;
  return rules
    .filter((r) => r.weekday === weekday)
    .map((r) => ({
      start: timeOn(dateKey, r.startTime),
      end: timeOn(dateKey, r.endTime),
    }))
    .filter((r) => r.start < r.end)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function hasAnyAvailability(
  rules: readonly AvailabilityRuleInput[],
): boolean {
  return rules.length > 0;
}

/** 수업 시간 전체가 근무 시간대 하나 안에 들어가는가 */
export function isWithinWorkingHours(
  range: TimeRange,
  rules: readonly AvailabilityRuleInput[],
  exceptions: readonly AvailabilityExceptionInput[],
): boolean {
  const day = toKstDateKey(range.start);
  return workingRangesOn(day, rules, exceptions).some(
    (w) => w.start <= range.start && range.end <= w.end,
  );
}

/** 수강생이 신청할 수 있는 마지막 시각: 수업 12시간 전 (4.5) */
export const STUDENT_REQUEST_LEAD_MS = 12 * HOUR;
/** 빈 시간 칸의 시작 간격 */
export const SLOT_STEP_MINUTES = 30;

/**
 * 수강생 캘린더의 "예약 가능" 칸 (4.5).
 * 근무 시간 안, 칸 길이 = 1회 수업 시간, 30분 간격으로 시작, 다른 예약과 겹치지 않고,
 * 지금부터 12시간 뒤 이후에 시작하는 칸만.
 */
export function openSlots(input: {
  from: string;
  to: string;
  sessionMinutes: number;
  rules: readonly AvailabilityRuleInput[];
  exceptions: readonly AvailabilityExceptionInput[];
  busy: readonly TimeRange[];
  now: Date;
}): TimeRange[] {
  const out: TimeRange[] = [];
  const earliest = new Date(input.now.getTime() + STUDENT_REQUEST_LEAD_MS);
  for (
    let d = parseKstDateKey(input.from);
    toKstDateKey(d) <= input.to;
    d = addKstDays(d, 1)
  ) {
    const key = toKstDateKey(d);
    for (const w of workingRangesOn(key, input.rules, input.exceptions)) {
      for (
        let t = w.start.getTime();
        t + input.sessionMinutes * MINUTE <= w.end.getTime();
        t += SLOT_STEP_MINUTES * MINUTE
      ) {
        const slot = {
          start: new Date(t),
          end: new Date(t + input.sessionMinutes * MINUTE),
        };
        if (slot.start < earliest) continue;
        if (input.busy.some((b) => overlaps(b, slot))) continue;
        out.push(slot);
      }
    }
  }
  return out;
}

/**
 * 반복 예약: 매주 고른 요일·시각에 n회 (예: 매주 월·수 19시 8회).
 * 시작일부터 날짜 순으로 만든다.
 */
export function weeklySlots(input: {
  startDate: string;
  weekdays: readonly number[];
  time: string;
  durationMinutes: number;
  count: number;
}): TimeRange[] {
  const days = new Set(input.weekdays);
  if (days.size === 0 || input.count < 1) return [];
  const out: TimeRange[] = [];
  let d = parseKstDateKey(input.startDate);
  for (let guard = 0; out.length < input.count && guard < 400 * 7; guard++) {
    if (days.has(toKstParts(d).weekday)) {
      const start = combineKstDateAndTime(toKstDateKey(d), input.time);
      out.push({
        start,
        end: new Date(start.getTime() + input.durationMinutes * MINUTE),
      });
    }
    d = addKstDays(d, 1);
  }
  return out;
}

// ── 기한 ──

/** 신청 대기: 수업 12시간 전까지 무응답이면 만료 (4.5) */
export function requestExpiresAt(startAt: Date): Date {
  return new Date(startAt.getTime() - 12 * HOUR);
}

/** 확정 대기: 수업 시작까지 무응답이면 자동 확정 (4.4) */
export function autoConfirmAt(startAt: Date): Date {
  return startAt;
}

/** 시간 변경 요청: 원래 시간과 새 시간 중 빠른 시각에 만료 (4.6) */
export function changeRequestExpiresAt(
  originalStart: Date,
  proposedStarts: readonly Date[],
): Date {
  return new Date(
    Math.min(
      originalStart.getTime(),
      ...proposedStarts.map((d) => d.getTime()),
    ),
  );
}

/** 시간 변경 요청 가능 여부: 규칙의 예약 변경 기한(수업 n시간 전까지) */
export function canRequestChange(
  startAt: Date,
  now: Date,
  changeDeadlineHours: number,
): boolean {
  return now.getTime() <= startAt.getTime() - changeDeadlineHours * HOUR;
}

/**
 * 잔여 부족 예약의 자동 취소 시각 (3.4).
 * 수업 24시간 전. 잔여 부족이 수업 24시간 이내에 생겼으면 수업 2시간 전.
 */
export function insufficientCancelAt(
  startAt: Date,
  insufficientAt: Date,
): Date {
  const h24 = startAt.getTime() - 24 * HOUR;
  return new Date(
    insufficientAt.getTime() < h24 ? h24 : startAt.getTime() - 2 * HOUR,
  );
}
