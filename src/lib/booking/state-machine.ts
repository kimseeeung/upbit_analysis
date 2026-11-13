/**
 * 예약 상태 전이 (명세 4.1). 표에 있는 전이만 허용하고 그 밖은 서버에서 거부한다.
 * docs/05 "Claude 가정"에 따라 표를 넓게 해석한 전이:
 *  - 신청 대기 → 취소 (수강생 철회, 탈퇴·일시정지·잔여 부족으로 인한 취소)
 *  - 신청 대기·확정 대기 → 잔여 부족, 잔여 부족 → 원래 상태(신청 대기·확정 대기·예약 확정)로 복구
 *  - "이견 처리"는 상태가 아니라 표시. 노쇼 → 취소는 이견 처리 결과일 때만
 */

import type { BookingStatus } from "@/lib/rules/availability";

export type { BookingStatus };

export const STATUS_LABEL: Record<BookingStatus, string> = {
  REQUESTED: "신청 대기",
  PENDING_CONFIRM: "확정 대기",
  CONFIRMED: "예약 확정",
  INSUFFICIENT: "잔여 부족",
  PENDING_APPROVAL: "완료 승인 대기",
  COMPLETED: "완료",
  NO_SHOW: "노쇼",
  CANCELED: "취소",
  REJECTED: "거절됨",
  EXPIRED: "만료",
};

export const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  REQUESTED: ["CONFIRMED", "REJECTED", "EXPIRED", "CANCELED", "INSUFFICIENT"],
  PENDING_CONFIRM: ["CONFIRMED", "REJECTED", "CANCELED", "INSUFFICIENT"],
  CONFIRMED: ["PENDING_APPROVAL", "NO_SHOW", "CANCELED", "INSUFFICIENT"],
  INSUFFICIENT: ["CONFIRMED", "PENDING_CONFIRM", "REQUESTED", "CANCELED"],
  PENDING_APPROVAL: ["COMPLETED", "NO_SHOW", "CANCELED"],
  COMPLETED: [],
  NO_SHOW: ["CANCELED"],
  CANCELED: [],
  REJECTED: [],
  EXPIRED: [],
};

export const TERMINAL: readonly BookingStatus[] = [
  "COMPLETED",
  "CANCELED",
  "REJECTED",
  "EXPIRED",
];

/** 같은 시간 중복 검사에 넣는 상태 (아직 진행 중이거나 진행된 수업) */
export const OCCUPYING: readonly BookingStatus[] = [
  "REQUESTED",
  "PENDING_CONFIRM",
  "CONFIRMED",
  "INSUFFICIENT",
  "PENDING_APPROVAL",
  "COMPLETED",
  "NO_SHOW",
];

export class TransitionError extends Error {
  constructor(
    readonly from: BookingStatus,
    readonly to: BookingStatus,
    message?: string,
  ) {
    super(
      message ??
        `${STATUS_LABEL[from]}에서 ${STATUS_LABEL[to]}(으)로 바꿀 수 없습니다`,
    );
    this.name = "TransitionError";
  }
}

export interface TransitionContext {
  now: Date;
  startAt: Date;
  endAt: Date;
  /** 잔여 부족 복구 시 돌아갈 상태 */
  prevStatus?: BookingStatus | null;
  /** 이견 처리 결과로 바꾸는가 */
  viaDispute?: boolean;
}

const HOUR = 60 * 60 * 1000;

/** 전이가 허용되는지 검사한다. 허용되지 않으면 TransitionError */
export function assertTransition(
  from: BookingStatus,
  to: BookingStatus,
  ctx: TransitionContext,
): void {
  if (!TRANSITIONS[from].includes(to)) throw new TransitionError(from, to);

  if (from === "INSUFFICIENT" && to !== "CANCELED") {
    const back = ctx.prevStatus ?? "CONFIRMED";
    if (to !== back) {
      throw new TransitionError(
        from,
        to,
        `잔여 부족 예약은 원래 상태(${STATUS_LABEL[back]})로만 복구됩니다`,
      );
    }
  }
  if (from === "PENDING_APPROVAL" && (to === "NO_SHOW" || to === "CANCELED")) {
    if (ctx.now.getTime() > ctx.endAt.getTime() + 24 * HOUR) {
      throw new TransitionError(
        from,
        to,
        "수업 종료 후 24시간이 지나 노쇼·취소로 바꿀 수 없습니다",
      );
    }
  }
  if (from === "CONFIRMED" && to === "NO_SHOW" && ctx.now < ctx.startAt) {
    throw new TransitionError(
      from,
      to,
      "수업이 시작된 뒤에 노쇼로 처리할 수 있습니다",
    );
  }
  if (
    from === "CONFIRMED" &&
    to === "PENDING_APPROVAL" &&
    ctx.now < ctx.endAt
  ) {
    throw new TransitionError(
      from,
      to,
      "수업이 끝난 뒤에 완료 승인을 요청할 수 있습니다",
    );
  }
  if (from === "NO_SHOW" && to === "CANCELED" && !ctx.viaDispute) {
    throw new TransitionError(
      from,
      to,
      "노쇼는 이의 제기 처리로만 취소할 수 있습니다",
    );
  }
}

export function canTransition(
  from: BookingStatus,
  to: BookingStatus,
  ctx: TransitionContext,
): boolean {
  try {
    assertTransition(from, to, ctx);
    return true;
  } catch {
    return false;
  }
}
