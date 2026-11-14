/**
 * SMS 본인인증 규칙 (명세 1.2, 순수 함수).
 * - 6자리, 3분 유효
 * - 재발송은 30초 뒤부터, 하루(한국 날짜) 5회까지 — 전화번호 기준, 용도 합산
 * - 5회 틀리면 그 번호는 못 쓰고 새 번호를 받아야 함
 * - 인증 완료 후 30분 안에 가입·재설정을 끝내야 함
 */

import { randomInt } from "node:crypto";
import { toKstDateKey } from "@/lib/time";

export const CODE_TTL_MS = 3 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 30 * 1000;
export const DAILY_SEND_LIMIT = 5;
export const MAX_ATTEMPTS = 5;
export const VERIFIED_USE_WINDOW_MS = 30 * 60 * 1000;

/** 테스트 모드 고정 인증번호 */
export const TEST_SMS_CODE = "000000";

/**
 * 테스트 모드: 실제 문자를 보내지 않는 개발용 발송(SMS_PROVIDER=console)일 때는
 * 인증번호를 000000으로 고정하고 재발송 대기·하루 횟수 제한을 두지 않는다.
 * SMS_FIXED_CODE=0이면 끈다. 운영 관리자 2단계 인증도 같은 번호를 쓴다(사용자 요청).
 */
export function smsTestMode(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (
    (env.SMS_PROVIDER ?? "console") === "console" && env.SMS_FIXED_CODE !== "0"
  );
}

export function generateSmsCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type SendCheck =
  | { ok: true }
  | { ok: false; reason: "COOLDOWN"; retryAfterSec: number; message: string }
  | { ok: false; reason: "DAILY_LIMIT"; message: string };

/** 같은 번호로 보낸 기록(createdAt)으로 지금 보낼 수 있는지 판단 */
export function checkCanSend(sentAt: Date[], now: Date): SendCheck {
  const today = toKstDateKey(now);
  const todayCount = sentAt.filter((d) => toKstDateKey(d) === today).length;
  if (todayCount >= DAILY_SEND_LIMIT) {
    return {
      ok: false,
      reason: "DAILY_LIMIT",
      message:
        "인증번호는 하루 5회까지 받을 수 있습니다. 내일 다시 시도해 주세요",
    };
  }
  const last = sentAt.reduce<Date | null>(
    (acc, d) => (!acc || d > acc ? d : acc),
    null,
  );
  if (last) {
    const elapsed = now.getTime() - last.getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      return {
        ok: false,
        reason: "COOLDOWN",
        retryAfterSec,
        message: `${retryAfterSec}초 뒤에 다시 받을 수 있습니다`,
      };
    }
  }
  return { ok: true };
}

export interface VerificationState {
  expiresAt: Date;
  attempts: number;
  verifiedAt: Date | null;
  consumedAt: Date | null;
}

export type AttemptPrecheck =
  | { ok: true }
  | { ok: false; reason: "EXPIRED" | "TOO_MANY" | "ALREADY"; message: string };

/** 번호를 맞춰 보기 전에 시도할 수 있는 상태인지 */
export function precheckAttempt(
  v: VerificationState,
  now: Date,
): AttemptPrecheck {
  if (v.verifiedAt || v.consumedAt) {
    return { ok: false, reason: "ALREADY", message: "이미 인증을 마쳤습니다" };
  }
  if (v.attempts >= MAX_ATTEMPTS) {
    return {
      ok: false,
      reason: "TOO_MANY",
      message:
        "5회 틀려서 이 인증번호는 쓸 수 없습니다. 새 인증번호를 받아 주세요",
    };
  }
  if (v.expiresAt.getTime() <= now.getTime()) {
    return {
      ok: false,
      reason: "EXPIRED",
      message: "인증 시간이 지났습니다. 새 인증번호를 받아 주세요",
    };
  }
  return { ok: true };
}

/** 인증 완료된 결과를 지금 쓸 수 있는지(가입·재설정 시점) */
export function canConsumeVerification(
  v: VerificationState,
  now: Date,
): boolean {
  return (
    !!v.verifiedAt &&
    !v.consumedAt &&
    now.getTime() - v.verifiedAt.getTime() <= VERIFIED_USE_WINDOW_MS
  );
}
