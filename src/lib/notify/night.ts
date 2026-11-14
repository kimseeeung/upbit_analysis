/**
 * 야간 발송 제한 (명세 8.3). 순수 함수.
 * 2026-11-14 사용자 요청으로 기본은 꺼짐(시간 제한 없이 바로 보냄).
 * 다시 켜려면 환경 변수 NEXT_PUBLIC_NOTIFY_QUIET_HOURS=1 (빌드 시 화면에도 반영).
 * 아래 규칙은 켰을 때만 적용된다.
 * - 21:00~08:00(한국 시간)에는 자동 알림(웹 푸시)을 보내지 않고 08:00에 보낸다
 * - 2시간 전 알림 시각이 야간이면 08:00에 보내되, 그 시각이 수업 1시간 전보다 늦으면 보내지 않는다
 * - 예약을 늦게 잡아 알림 시각이 이미 지났으면 그 알림은 보내지 않는다
 */

import {
  addKstDays,
  kstDateTime,
  parseKstDateKey,
  toKstDateKey,
  toKstParts,
} from "@/lib/time";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const NIGHT_START_HOUR = 21;
export const DAY_START_HOUR = 8;

/** 야간 주석 문구 (8.3, 그대로 사용) */
export const NIGHT_NOTICE =
  "※ 정보통신망법 제50조 제3항에 따라 오후 9시부터 다음 날 오전 8시까지는 별도 동의 없이 광고성 정보를 보낼 수 없습니다. 이 서비스는 수업 안내 알림도 같은 시간에는 보내지 않습니다.";

export const NIGHT_SHARE_CONFIRM = "지금은 야간 시간입니다. 그래도 보낼까요?";

/** 야간 발송 제한을 쓰는가 (기본 꺼짐) */
export function quietHoursEnabled(): boolean {
  return process.env.NEXT_PUBLIC_NOTIFY_QUIET_HOURS === "1";
}

/** 한국 시간 21:00~08:00. 제한을 끄면 언제나 false */
export function isNight(at: Date): boolean {
  if (!quietHoursEnabled()) return false;
  const h = toKstParts(at).hour;
  return h >= NIGHT_START_HOUR || h < DAY_START_HOUR;
}

/** 야간이면 다음 08:00(한국 시간)으로 미룬다 */
export function adjustForNight(at: Date): Date {
  if (!isNight(at)) return at;
  const p = toKstParts(at);
  const morning = kstDateTime(p.year, p.month, p.day, DAY_START_HOUR);
  return p.hour >= NIGHT_START_HOUR ? addKstDays(morning, 1) : morning;
}

export type SendPlan =
  | { send: true; sendAt: Date }
  | { send: false; reason: "PAST" | "TOO_LATE_AFTER_NIGHT" };

/**
 * 일반 자동 알림의 발송 시각.
 * 정한 시각이 지났으면(지금 바로 보내야 하는 알림 포함) 지금, 야간이면 08:00.
 */
export function planImmediate(now: Date): Date {
  return adjustForNight(now);
}

/**
 * 수업 전 알림(전일·2시간 전)의 발송 계획.
 * @param scheduledAt 원래 알림 시각
 * @param now 알림을 만드는 시각 (예약을 잡은 시각)
 */
export function planReminder(scheduledAt: Date, now: Date): SendPlan {
  if (scheduledAt.getTime() < now.getTime())
    return { send: false, reason: "PAST" };
  return { send: true, sendAt: adjustForNight(scheduledAt) };
}

/** 2시간 전 알림 (8.3): 야간이면 08:00, 그 시각이 수업 1시간 전보다 늦으면 생략 */
export function planTwoHourReminder(startAt: Date, now: Date): SendPlan {
  const plan = planReminder(new Date(startAt.getTime() - 2 * HOUR), now);
  if (!plan.send) return plan;
  if (plan.sendAt.getTime() > startAt.getTime() - HOUR)
    return { send: false, reason: "TOO_LATE_AFTER_NIGHT" };
  return plan;
}

/** 전일 알림: 수업 전날 트레이너가 정한 시각 (08:00~20:30) */
export function dayBeforeAt(startAt: Date, time: string): Date {
  const prev = toKstDateKey(
    addKstDays(parseKstDateKey(toKstDateKey(startAt)), -1),
  );
  const [h, m] = time.split(":").map(Number);
  const [y, mo, d] = prev.split("-").map(Number);
  return kstDateTime(y, mo, d, h, m);
}

export function planDayBeforeReminder(
  startAt: Date,
  time: string,
  now: Date,
): SendPlan {
  return planReminder(dayBeforeAt(startAt, time), now);
}

/** 30분 간격 시각 목록 (from~to, 분 단위) */
function halfHours(from: number, to: number): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m += 30)
    out.push(
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
    );
  return out;
}

/**
 * 전일 알림 시각으로 고를 수 있는 값 (30분 간격).
 * 제한을 끄면 00:00~23:30, 켜면 08:00~20:30 (야간이 시작되는 21:00은 제외)
 */
export function dayBeforeTimeOptions(): string[] {
  return quietHoursEnabled()
    ? halfHours(8 * 60, 20 * 60 + 30)
    : halfHours(0, 23 * 60 + 30);
}

export function isValidDayBeforeTime(t: string): boolean {
  return dayBeforeTimeOptions().includes(t);
}
