/**
 * 차감 판단 (명세 3.5, 4.7, 5). 순수 함수.
 * - 완료: 1회 차감 (규칙 동의와 관계없음)
 * - 노쇼: 규칙이 "1회 차감"이고 수강생이 규칙에 동의했을 때만 차감
 * - 당일 취소: 수강생이 요청한 시각이 "수업 n시간 전" 이후이고, 규칙 "1회 차감" + 동의일 때 차감
 * - 트레이너 취소·시스템 취소(일시정지·탈퇴·잔여 부족): 차감 없음
 * 동의 전에는 노쇼·당일 취소를 기록만 하고 차감하지 않는다("미동의로 차감 안 함").
 */

import type { RuleValues } from "@/lib/rules/rule-set";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const DAY = 24 * HOUR;

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
  /** 차감 대상이지만 규칙 미동의로 차감하지 않음 */
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

/** 노쇼 차감 판단 */
export function decideNoShowDeduction(input: {
  rules: RuleValues;
  ruleAgreed: boolean;
}): { deduct: boolean; skippedReason: "NO_CONSENT" | null } {
  if (!input.rules.noShowDeduct) return { deduct: false, skippedReason: null };
  if (!input.ruleAgreed) return { deduct: false, skippedReason: "NO_CONSENT" };
  return { deduct: true, skippedReason: null };
}

/** 노쇼 처리 가능 시각: 수업 시작 + 규칙의 판정 시간 (3.5) */
export function noShowAllowedAt(startAt: Date, rules: RuleValues): Date {
  return new Date(startAt.getTime() + rules.noShowMinutes * MINUTE);
}

/** 완료 승인 대기에서 노쇼·취소로 바꿀 수 있는 마지막 시각: 종료 후 24시간 (5.1) */
export function correctionDeadline(endAt: Date): Date {
  return new Date(endAt.getTime() + DAY);
}

export type ApprovalDeadlineAction =
  /** 아직 기한 전 */
  | "WAIT"
  /** 규칙에 동의한 수강생: 자동 완료 */
  | "AUTO_COMPLETE"
  /** 미동의 수강생: 자동 완료하지 않고 트레이너가 직접 완료 처리 ("트레이너 확정") */
  | "NEEDS_TRAINER_CONFIRM";

/** 미승인 기한 (5.1): 승인 요청 후 규칙의 일수가 지나면 */
export function decideApprovalDeadline(input: {
  approvalRequestedAt: Date;
  now: Date;
  rules: RuleValues;
  ruleAgreed: boolean;
  disputed: boolean;
}): ApprovalDeadlineAction {
  // 거절(이견)된 승인은 이견 처리로 끝낸다
  if (input.disputed) return "WAIT";
  const due =
    input.approvalRequestedAt.getTime() +
    input.rules.unapprovedAutoCompleteDays * DAY;
  if (input.now.getTime() < due) return "WAIT";
  return input.ruleAgreed ? "AUTO_COMPLETE" : "NEEDS_TRAINER_CONFIRM";
}

/** 이견 처리 기한 (5.2): 트레이너가 7일 안에 고르지 않으면 "수강생 의견 수락" */
export const DISPUTE_DECISION_DAYS = 7;

export function isDisputeOverdue(disputeAt: Date, now: Date): boolean {
  return now.getTime() >= disputeAt.getTime() + DISPUTE_DECISION_DAYS * DAY;
}
