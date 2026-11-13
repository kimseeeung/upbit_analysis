/**
 * 수강 현황 (명세 6장). 순수 함수. 날짜는 한국 날짜 키, 조회 기간은 양 끝 포함.
 *
 * 인계된 수강생의 귀속:
 * - 수강·노쇼·취소·승인 대기: 그 수업을 진행한 트레이너
 * - 전체 PT 횟수·잔여 횟수: 조회 종료일 기준 담당 트레이너
 */

export interface Assignment {
  trainerId: string;
  /** 담당 시작일 (포함) */
  start: string;
  /** 담당 종료일 (포함), 지금 담당이면 null */
  end: string | null;
}

export interface StatPass {
  id: string;
  count: number;
  bonusCount: number;
  startDate: string;
  endDate: string;
  status: string;
  soldByTrainerId: string;
  price: number | null;
  paidAt: string | null;
}

export interface StatBooking {
  id: string;
  date: string;
  trainerId: string;
  status: string;
  deducted: boolean;
  passId: string | null;
  lateCancel: boolean;
}

export interface StatStudent {
  id: string;
  name: string;
  assignments: Assignment[];
  passes: StatPass[];
  bookings: StatBooking[];
}

export interface StatRow {
  studentId: string;
  name: string;
  /** 조회 종료일 기준 담당인가 (아니면 전체·잔여·만료는 비움) */
  isCurrent: boolean;
  totalPt: number | null;
  completed: number;
  noShow: number;
  canceled: number;
  lateCanceled: number;
  pendingApproval: number;
  remaining: number | null;
  expiry: string | null;
  expirySoon: boolean;
}

const UNUSABLE = ["REFUNDED", "SUSPENDED"];
const DAY = 86400_000;

export function trainerOnDate(
  assignments: readonly Assignment[],
  date: string,
): string | null {
  const a = assignments.find(
    (x) => x.start <= date && (x.end === null || date <= x.end),
  );
  return a?.trainerId ?? null;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

function daysBetween(a: string, b: string) {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY,
  );
}

/** 조회 종료일 기준 잔여: 그날 유효한 이용권의 (등록+서비스 − 그날까지 차감) */
export function remainingAsOf(student: StatStudent, date: string): number {
  return student.passes
    .filter(
      (p) =>
        !UNUSABLE.includes(p.status) &&
        p.startDate <= date &&
        date <= p.endDate,
    )
    .reduce((sum, p) => {
      const used = student.bookings.filter(
        (b) => b.deducted && b.passId === p.id && b.date <= date,
      ).length;
      return sum + Math.max(0, p.count + p.bonusCount - used);
    }, 0);
}

export function computeTrainerStats(input: {
  trainerId: string;
  from: string;
  to: string;
  today: string;
  students: readonly StatStudent[];
}): StatRow[] {
  const { trainerId: T, from, to, today } = input;
  const rows: StatRow[] = [];
  for (const s of input.students) {
    const mine = s.bookings.filter(
      (b) => b.trainerId === T && from <= b.date && b.date <= to,
    );
    const isCurrent = trainerOnDate(s.assignments, to) === T;
    if (!isCurrent && mine.length === 0) continue;
    const count = (st: string) => mine.filter((b) => b.status === st).length;
    const usable = s.passes.filter((p) => !UNUSABLE.includes(p.status));
    const current = usable
      .filter((p) => p.startDate <= today && today <= p.endDate)
      .sort((a, b) => (a.endDate < b.endDate ? -1 : 1))[0];
    rows.push({
      studentId: s.id,
      name: s.name,
      isCurrent,
      totalPt: isCurrent
        ? usable
            .filter((p) => overlaps(p.startDate, p.endDate, from, to))
            .reduce((n, p) => n + p.count + p.bonusCount, 0)
        : null,
      completed: count("COMPLETED"),
      noShow: count("NO_SHOW"),
      canceled: count("CANCELED"),
      lateCanceled: mine.filter((b) => b.status === "CANCELED" && b.lateCancel)
        .length,
      pendingApproval: count("PENDING_APPROVAL"),
      remaining: isCurrent ? remainingAsOf(s, to) : null,
      expiry: isCurrent && current ? current.endDate : null,
      expirySoon:
        isCurrent && !!current && daysBetween(today, current.endDate) <= 7,
    });
  }
  return rows;
}

export interface StatSummary {
  totalClasses: number;
  noShowRate: number;
  paymentSum: number;
}

/** 요약 카드: 총 수업 수, 노쇼율, 결제 합계(기간 안 결제, 판매 트레이너 기준) */
export function summarizeStats(input: {
  trainerId: string;
  from: string;
  to: string;
  rows: readonly StatRow[];
  students: readonly StatStudent[];
}): StatSummary {
  const completed = input.rows.reduce((n, r) => n + r.completed, 0);
  const noShow = input.rows.reduce((n, r) => n + r.noShow, 0);
  const paymentSum = input.students
    .flatMap((s) => s.passes)
    .filter(
      (p) =>
        p.soldByTrainerId === input.trainerId &&
        p.paidAt &&
        input.from <= p.paidAt &&
        p.paidAt <= input.to &&
        p.price,
    )
    .reduce((n, p) => n + (p.price ?? 0), 0);
  return {
    totalClasses: completed,
    noShowRate: completed + noShow === 0 ? 0 : noShow / (completed + noShow),
    paymentSum,
  };
}

/** 표 정렬 */
export type SortKey = keyof Pick<
  StatRow,
  | "name"
  | "totalPt"
  | "completed"
  | "noShow"
  | "canceled"
  | "pendingApproval"
  | "remaining"
  | "expiry"
>;

export function sortRows(
  rows: readonly StatRow[],
  key: SortKey,
  dir: "asc" | "desc",
): StatRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x === y) return a.name.localeCompare(b.name, "ko");
    if (x === null) return 1;
    if (y === null) return -1;
    return (x < y ? -1 : 1) * sign;
  });
}

/** 엑셀에서 바로 열리는 CSV (UTF-8 BOM) */
export function toCsv(rows: readonly StatRow[]): string {
  const head = [
    "수강생",
    "전체 PT 횟수",
    "수강 횟수",
    "노쇼 횟수",
    "취소 횟수",
    "당일 취소",
    "승인 대기",
    "잔여 횟수",
    "만료일",
  ];
  const esc = (v: unknown) => {
    const t = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lines = rows.map((r) =>
    [
      r.name,
      r.totalPt,
      r.completed,
      r.noShow,
      r.canceled,
      r.lateCanceled,
      r.pendingApproval,
      r.remaining,
      r.expiry,
    ]
      .map(esc)
      .join(","),
  );
  return `﻿${[head.join(","), ...lines].join("\r\n")}\r\n`;
}
