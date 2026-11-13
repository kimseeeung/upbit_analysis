/**
 * 잔여 횟수와 예약 가능 횟수 (명세 3.4). 순수 함수.
 * 화면에서 직접 계산하지 말고 서버의 getAvailableCount()로만 쓴다(CLAUDE.md).
 *
 * - 잔여 횟수 = (등록 + 서비스) − 완료 − 차감된 노쇼 − 차감된 당일 취소
 *   → 차감된(deducted) 예약 수를 이용권별로 뺀다
 * - 예정 예약 = 확정 대기 + 예약 확정(변경 요청 중 포함, 한 번만 셈) + 신청 대기 + 완료 승인 대기
 * - 예정 예약은 "이전 이용권부터 사용"(시작일 → 등록 순) 순서로, 수업 날짜에 유효한
 *   이용권에 하나씩 배정한다. 예약 가능 횟수 = 그 날짜에 유효한 이용권들의
 *   (잔여 − 배정된 예정 예약) 합.
 * - 어느 이용권에도 배정되지 못한 예약이 "잔여 부족" 대상이다.
 *
 * 날짜는 모두 한국 날짜 키("YYYY-MM-DD")로 비교한다.
 */

export type PassStatus =
  "ACTIVE" | "PAUSED" | "EXHAUSTED" | "EXPIRED" | "REFUNDED" | "SUSPENDED";

export type BookingStatus =
  | "REQUESTED"
  | "PENDING_CONFIRM"
  | "CONFIRMED"
  | "INSUFFICIENT"
  | "PENDING_APPROVAL"
  | "COMPLETED"
  | "NO_SHOW"
  | "CANCELED"
  | "REJECTED"
  | "EXPIRED";

export interface DateRange {
  /** 포함 */
  startDate: string;
  /** 포함 */
  endDate: string;
}

export interface PassForCount {
  id: string;
  count: number;
  bonusCount: number;
  startDate: string;
  endDate: string;
  status: PassStatus;
  /** 승인된 일시정지 기간 (일찍 재개했으면 실제 종료일) */
  pauses?: DateRange[];
  /** 같은 시작일일 때 순서 (등록 시각 ISO 등) */
  order?: string;
}

export interface BookingForCount {
  id: string;
  /** 수업 날짜 (한국) */
  date: string;
  /** 같은 날 순서용 (시작 시각 ISO) */
  startAt: string;
  status: BookingStatus;
  deducted: boolean;
  /** 차감된 예약이 차감한 이용권 */
  passId?: string | null;
}

/** 예정 예약 상태 (3.4). 잔여 부족 예약은 배정 대상이지만 다른 예정 예약 뒤에 배정한다 */
export const SCHEDULED_STATUSES: readonly BookingStatus[] = [
  "REQUESTED",
  "PENDING_CONFIRM",
  "CONFIRMED",
  "PENDING_APPROVAL",
];

/** 예약에 쓸 수 없는 이용권 상태 */
const UNUSABLE: readonly PassStatus[] = ["REFUNDED", "SUSPENDED"];

export function isPausedOn(pass: PassForCount, date: string): boolean {
  return (pass.pauses ?? []).some(
    (p) => p.startDate <= date && date <= p.endDate,
  );
}

/** 이 날짜의 수업에 쓸 수 있는 이용권인가 (기간 안, 정지 아님, 환불·사용 중지 아님) */
export function isPassValidOn(pass: PassForCount, date: string): boolean {
  return (
    !UNUSABLE.includes(pass.status) &&
    pass.startDate <= date &&
    date <= pass.endDate &&
    !isPausedOn(pass, date)
  );
}

/** 이용권별 잔여 횟수 (차감된 예약만 뺀다) */
export function computeRemaining(
  pass: PassForCount,
  bookings: readonly BookingForCount[],
): number {
  const deducted = bookings.filter(
    (b) => b.deducted && b.passId === pass.id,
  ).length;
  return Math.max(0, pass.count + pass.bonusCount - deducted);
}

function passOrder(a: PassForCount, b: PassForCount): number {
  if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
  const ao = a.order ?? a.id;
  const bo = b.order ?? b.id;
  return ao < bo ? -1 : ao > bo ? 1 : 0;
}

export interface Allocation {
  /** 이용권 id → 잔여 횟수 */
  remaining: Record<string, number>;
  /** 이용권 id → 배정된 예정 예약 수 */
  allocated: Record<string, number>;
  /** 예약 id → 배정된 이용권 id */
  assignment: Record<string, string>;
  /** 배정되지 못한 예정·잔여 부족 예약 (잔여 부족 대상, 수업 순) */
  overflow: string[];
}

/**
 * 예정 예약을 이용권에 배정한다.
 * 수업이 이른 예약부터, 그 날짜에 유효한 이용권 중 이전 이용권부터 채운다.
 * 이미 "잔여 부족"인 예약은 다른 예정 예약을 다 배정한 뒤에 배정한다
 * (이용권이 추가되면 원래 상태로 복구할 수 있는지 보기 위해).
 */
export function allocateBookings(
  passes: readonly PassForCount[],
  bookings: readonly BookingForCount[],
  options: { excludeBookingId?: string } = {},
): Allocation {
  const sorted = [...passes].sort(passOrder);
  const remaining: Record<string, number> = {};
  const allocated: Record<string, number> = {};
  for (const p of sorted) {
    remaining[p.id] = computeRemaining(p, bookings);
    allocated[p.id] = 0;
  }

  const byTime = (a: BookingForCount, b: BookingForCount) =>
    a.startAt < b.startAt
      ? -1
      : a.startAt > b.startAt
        ? 1
        : a.id < b.id
          ? -1
          : 1;
  const candidates = bookings.filter((b) => b.id !== options.excludeBookingId);
  const scheduled = candidates
    .filter((b) => SCHEDULED_STATUSES.includes(b.status))
    .sort(byTime);
  const insufficient = candidates
    .filter((b) => b.status === "INSUFFICIENT")
    .sort(byTime);

  const assignment: Record<string, string> = {};
  const overflow: string[] = [];
  for (const b of [...scheduled, ...insufficient]) {
    const pass = sorted.find(
      (p) => isPassValidOn(p, b.date) && allocated[p.id] < remaining[p.id],
    );
    if (pass) {
      allocated[pass.id] += 1;
      assignment[b.id] = pass.id;
    } else {
      overflow.push(b.id);
    }
  }
  return { remaining, allocated, assignment, overflow };
}

/**
 * 이 날짜에 새 예약을 하나 더 잡을 수 있는 횟수.
 * 0이면 새 예약, 반복 예약, 수강생 신청, 신청 수락 모두 불가.
 * 만료일 이후·일시정지 기간에는 유효한 이용권이 없으므로 0.
 *
 * excludeBookingId: 신청 수락·시간 변경처럼 이미 세어진 예약을 다시 검사할 때 그 예약을 뺀다.
 */
export function computeAvailableCount(
  passes: readonly PassForCount[],
  bookings: readonly BookingForCount[],
  date: string,
  options: { excludeBookingId?: string } = {},
): number {
  const a = allocateBookings(passes, bookings, options);
  return passes
    .filter((p) => isPassValidOn(p, date))
    .reduce(
      (sum, p) => sum + Math.max(0, a.remaining[p.id] - a.allocated[p.id]),
      0,
    );
}

/**
 * 반복 예약처럼 여러 날짜에 한꺼번에 잡을 때, 앞에서부터 잡을 수 있는 날짜만 고른다.
 * 하나씩 잡아 본 결과를 다음 날짜 계산에 반영한다.
 */
export function pickBookableDates(
  passes: readonly PassForCount[],
  bookings: readonly BookingForCount[],
  slots: readonly { date: string; startAt: string }[],
): { bookable: number[]; skipped: number[] } {
  const current: BookingForCount[] = [...bookings];
  const bookable: number[] = [];
  const skipped: number[] = [];
  slots.forEach((slot, i) => {
    const probe: BookingForCount = {
      id: `__probe_${i}`,
      date: slot.date,
      startAt: slot.startAt,
      status: "PENDING_CONFIRM",
      deducted: false,
    };
    const a = allocateBookings(passes, [...current, probe]);
    if (a.overflow.length === 0) {
      current.push(probe);
      bookable.push(i);
    } else {
      skipped.push(i);
    }
  });
  return { bookable, skipped };
}

/** 이용권의 화면 표시용 요약 (서버가 계산해 내려 준다) */
export function summarizePass(
  pass: PassForCount,
  bookings: readonly BookingForCount[],
  allocation: Allocation,
) {
  const total = pass.count + pass.bonusCount;
  const remaining =
    allocation.remaining[pass.id] ?? computeRemaining(pass, bookings);
  return {
    total,
    used: total - remaining,
    remaining,
    scheduled: allocation.allocated[pass.id] ?? 0,
  };
}
