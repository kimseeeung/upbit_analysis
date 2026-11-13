/**
 * 회원 탈퇴 (명세 2.4). 순수 함수.
 * 신청일로부터 5일 동안 유지한 뒤 삭제, 5일 안에 다시 로그인하면 취소 가능.
 */

import { createHash } from "node:crypto";
import { formatKstMonthDay } from "@/lib/time";

export const WITHDRAW_GRACE_DAYS = 5;
const DAY = 86400_000;

export const DELETED_STUDENT_NAME = "탈퇴 회원";
export const DELETED_TRAINER_NAME = "탈퇴 트레이너";

export function deleteScheduledAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + WITHDRAW_GRACE_DAYS * DAY);
}

/** 삭제 하루 전 "내일 계정이 삭제됩니다" 알림 시각 */
export function deletionNoticeAt(scheduledAt: Date): Date {
  return new Date(scheduledAt.getTime() - DAY);
}

export function canCancelWithdraw(
  status: string,
  scheduledAt: Date | null,
  now: Date,
): boolean {
  return status === "WITHDRAWING" && !!scheduledAt && now < scheduledAt;
}

/** 완료 안내창 문구 (2.4-5, 그대로) */
export function withdrawDoneMessage(scheduledAt: Date): string {
  return `탈퇴 신청일로부터 5일 동안 개인정보와 기록이 유지된 뒤 삭제됩니다. 삭제 예정일: ${formatKstMonthDay(scheduledAt)}. 5일 안에 다시 로그인하면 탈퇴를 취소할 수 있습니다. 탈퇴를 취소해도 취소된 예약은 복구되지 않습니다.`;
}

/**
 * 탈퇴 후 같은 아이디로 재가입 불가: 원래 아이디는 지우고 해시만 남겨 다시 쓰지 못하게 한다.
 */
export function retiredLoginId(loginId: string): string {
  return `deleted:${createHash("sha256").update(loginId).digest("hex").slice(0, 32)}`;
}
