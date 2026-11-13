/** 수강 규칙 (명세 3.5). 선택지 검사와 화면·알림에 쓰는 설명 문구. */

export interface RuleValues {
  lateCancelHours: number;
  lateCancelDeduct: boolean;
  noShowMinutes: number;
  noShowDeduct: boolean;
  lateGraceMinutes: number;
  unapprovedAutoCompleteDays: number;
  changeDeadlineHours: number;
  pauseMaxDays: number;
  pauseMaxCount: number;
}

export const DEFAULT_RULES: RuleValues = {
  lateCancelHours: 24,
  lateCancelDeduct: true,
  noShowMinutes: 15,
  noShowDeduct: true,
  lateGraceMinutes: 15,
  unapprovedAutoCompleteDays: 7,
  changeDeadlineHours: 24,
  pauseMaxDays: 30,
  pauseMaxCount: 2,
};

export const LATE_CANCEL_HOURS_OPTIONS = [6, 12, 24, 48] as const;
export const NO_SHOW_MINUTES_OPTIONS = [10, 15, 30] as const;

export type RuleCheck =
  { ok: true; value: RuleValues } | { ok: false; message: string };

function intIn(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max
    ? v
    : null;
}

/** 입력을 검사해 규칙 값으로 만든다. 빠진 값은 기본값 */
export function parseRuleValues(
  input: Partial<Record<keyof RuleValues, unknown>>,
): RuleCheck {
  const v = { ...DEFAULT_RULES, ...input } as Record<keyof RuleValues, unknown>;
  if (
    !(LATE_CANCEL_HOURS_OPTIONS as readonly unknown[]).includes(
      v.lateCancelHours,
    )
  ) {
    return {
      ok: false,
      message: "당일 취소 기준은 6·12·24·48시간 중에서 골라 주세요",
    };
  }
  if (
    !(NO_SHOW_MINUTES_OPTIONS as readonly unknown[]).includes(v.noShowMinutes)
  ) {
    return {
      ok: false,
      message: "노쇼 판정 시간은 10·15·30분 중에서 골라 주세요",
    };
  }
  if (
    typeof v.lateCancelDeduct !== "boolean" ||
    typeof v.noShowDeduct !== "boolean"
  ) {
    return { ok: false, message: "차감 여부를 골라 주세요" };
  }
  const days = intIn(v.unapprovedAutoCompleteDays, 1, 30);
  if (days === null)
    return {
      ok: false,
      message: "미승인 자동 완료 기간은 1~30일이어야 합니다",
    };
  const change = intIn(v.changeDeadlineHours, 0, 168);
  if (change === null)
    return { ok: false, message: "예약 변경 기한은 0~168시간이어야 합니다" };
  const pauseDays = intIn(v.pauseMaxDays, 1, 365);
  if (pauseDays === null)
    return {
      ok: false,
      message: "일시정지 1회 최대 일수는 1~365일이어야 합니다",
    };
  const pauseCount = intIn(v.pauseMaxCount, 0, 10);
  if (pauseCount === null)
    return { ok: false, message: "일시정지 횟수는 0~10회여야 합니다" };
  return {
    ok: true,
    value: {
      lateCancelHours: v.lateCancelHours as number,
      lateCancelDeduct: v.lateCancelDeduct,
      noShowMinutes: v.noShowMinutes as number,
      noShowDeduct: v.noShowDeduct,
      // 지각 기준 15분은 명세에서 고정
      lateGraceMinutes: DEFAULT_RULES.lateGraceMinutes,
      unapprovedAutoCompleteDays: days,
      changeDeadlineHours: change,
      pauseMaxDays: pauseDays,
      pauseMaxCount: pauseCount,
    },
  };
}

export function sameRules(a: RuleValues, b: RuleValues): boolean {
  return (Object.keys(DEFAULT_RULES) as (keyof RuleValues)[]).every(
    (k) => a[k] === b[k],
  );
}

export function pickRuleValues(r: RuleValues): RuleValues {
  return Object.fromEntries(
    (Object.keys(DEFAULT_RULES) as (keyof RuleValues)[]).map((k) => [k, r[k]]),
  ) as unknown as RuleValues;
}

/** 규칙 전문 (동의 화면, 차감 알림의 "적용한 규칙") */
export function describeRules(
  r: RuleValues,
): { title: string; text: string }[] {
  return [
    {
      title: "당일 취소",
      text: r.lateCancelDeduct
        ? `수업 ${r.lateCancelHours}시간 전 이후에 취소하면 1회 차감됩니다`
        : `수업 ${r.lateCancelHours}시간 전 이후에 취소해도 차감하지 않습니다`,
    },
    {
      title: "노쇼",
      text: r.noShowDeduct
        ? `수업 시작 후 ${r.noShowMinutes}분까지 오지 않으면 노쇼로 1회 차감됩니다`
        : `수업 시작 후 ${r.noShowMinutes}분까지 오지 않으면 노쇼로 기록하고 차감하지 않습니다`,
    },
    {
      title: "지각",
      text: `${r.lateGraceMinutes}분 이내 지각은 남은 시간만 수업합니다`,
    },
    {
      title: "미승인",
      text: `완료 승인 요청 후 ${r.unapprovedAutoCompleteDays}일 동안 응답이 없으면 완료 처리됩니다`,
    },
    {
      title: "예약 변경",
      text: `수업 ${r.changeDeadlineHours}시간 전까지 변경을 요청할 수 있습니다`,
    },
    {
      title: "일시정지",
      text: `한 번에 최대 ${r.pauseMaxDays}일, 이용권 하나에 ${r.pauseMaxCount}회까지 쉴 수 있습니다`,
    },
  ];
}

/**
 * 만료일 제안 (명세 3.2 "예: 20회는 3개월").
 * 10회 이하 2개월, 20회 이하 3개월, 30회 이하 4개월, 50회 이하 6개월, 그 이상 12개월.
 * 만료일은 시작일 + n개월 − 1일 (그날까지 사용 가능). 월말은 그 달의 마지막 날로 맞춘다.
 */
export function suggestEndDate(startDate: string, totalCount: number): string {
  const months =
    totalCount <= 10
      ? 2
      : totalCount <= 20
        ? 3
        : totalCount <= 30
          ? 4
          : totalCount <= 50
            ? 6
            : 12;
  const [y, m, d] = startDate.split("-").map(Number);
  const targetMonthIndex = m - 1 + months;
  const ty = y + Math.floor(targetMonthIndex / 12);
  const tm = targetMonthIndex % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(ty, tm, Math.min(d, lastDay)));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

export const PASS_STATUS_LABEL = {
  ACTIVE: "사용 중",
  PAUSED: "일시정지",
  EXHAUSTED: "소진",
  EXPIRED: "만료",
  REFUNDED: "환불",
  SUSPENDED: "사용 중지",
} as const;
