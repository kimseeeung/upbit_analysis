/**
 * 차감 판단 (명세 3.5, 4.7). 순수 함수.
 * M3: 취소 시 당일 취소 차감. M4에서 노쇼·완료를 더한다.
 */

import type { RuleValues } from "@/lib/rules/rule-set";

const HOUR = 60 * 60 * 1000;

export type CancelKind =
  /** 트레이너가 취소: 차감 없음 */
  | "TRAINER"
  /** 수강생 취소 요청을 트레이너가 수락 / 무응답 자동 취소 */
  | "STUDENT_REQUEST"
  /** 일시정지·탈퇴·잔여 부족 등 시스템 취소: 차감 없음 */
  | "SYSTEM";

export interface DeductionDecision {
  deduct: boolean;
  /** 당일 취소에 해당하는가 (차감 여부와 별개로 기록) */
  lateCancel: boolean;
  /** 당일 취소지만 규칙 미동의로 차감하지 않음 */
  skippedReason: "NO_CONSENT" | null;
}

/**
 * 취소 차감 판단. 차감 여부는 "요청한 시각" 기준 (늦게 수락돼도 불리하지 않음).
 * 수업 n시간 전 "이후"에 요청하면 당일 취소.
 */
export function decideCancelDeduction(input: {
  kind: CancelKind;
  startAt: Date;
  /** 수강생이 취소를 요청한 시각 */
  requestedAt: Date | null;
  rules: RuleValues;
  ruleAgreed: boolean;
}): DeductionDecision {
  if (input.kind !== "STUDENT_REQUEST" || !input.requestedAt) {
    return { deduct: false, lateCancel: false, skippedReason: null };
  }
  const threshold =
    input.startAt.getTime() - input.rules.lateCancelHours * HOUR;
  const lateCancel = input.requestedAt.getTime() > threshold;
  if (!lateCancel || !input.rules.lateCancelDeduct) {
    return { deduct: false, lateCancel, skippedReason: null };
  }
  if (!input.ruleAgreed)
    return { deduct: false, lateCancel, skippedReason: "NO_CONSENT" };
  return { deduct: true, lateCancel, skippedReason: null };
}
