import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "@/lib/rules/rule-set";
import { kstDateTime } from "@/lib/time";
import {
  correctionDeadline,
  decideApprovalDeadline,
  decideCancelDeduction,
  decideNoShowDeduction,
  isDisputeOverdue,
  noShowAllowedAt,
} from "./deduction";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const start = kstDateTime(2026, 11, 20, 19);
const end = kstDateTime(2026, 11, 20, 19, 50);

describe("차감 판단: 규칙 동의 여부", () => {
  const matrix = [
    // [규칙 차감, 동의, 기대 차감, 건너뛴 이유]
    [true, true, true, null],
    [true, false, false, "NO_CONSENT"],
    [false, true, false, null],
    [false, false, false, null],
  ] as const;

  for (const [ruleDeduct, agreed, deduct, skipped] of matrix) {
    it(`노쇼: 규칙 ${ruleDeduct ? "차감" : "차감 안 함"}, ${agreed ? "동의" : "미동의"} → ${deduct ? "차감" : "차감 안 함"}`, () => {
      expect(
        decideNoShowDeduction({
          rules: { ...DEFAULT_RULES, noShowDeduct: ruleDeduct },
          ruleAgreed: agreed,
        }),
      ).toEqual({
        deduct,
        skippedReason: skipped,
      });
    });
    it(`당일 취소: 규칙 ${ruleDeduct ? "차감" : "차감 안 함"}, ${agreed ? "동의" : "미동의"} → ${deduct ? "차감" : "차감 안 함"}`, () => {
      const r = decideCancelDeduction({
        kind: "STUDENT_REQUEST",
        startAt: start,
        requestedAt: new Date(start.getTime() - 2 * HOUR),
        rules: { ...DEFAULT_RULES, lateCancelDeduct: ruleDeduct },
        ruleAgreed: agreed,
      });
      expect(r).toEqual({ deduct, lateCancel: true, skippedReason: skipped });
    });
  }
});

describe("차감 판단: 요청 시각 기준 당일 취소", () => {
  const base = {
    kind: "STUDENT_REQUEST" as const,
    startAt: start,
    ruleAgreed: true,
  };
  for (const hours of [6, 12, 24, 48] as const) {
    it(`${hours}시간 기준: 기준 시각까지는 차감 없음, 이후 차감`, () => {
      const rules = { ...DEFAULT_RULES, lateCancelHours: hours };
      const at = new Date(start.getTime() - hours * HOUR);
      expect(
        decideCancelDeduction({ ...base, rules, requestedAt: at }).deduct,
      ).toBe(false);
      expect(
        decideCancelDeduction({
          ...base,
          rules,
          requestedAt: new Date(at.getTime() + 1),
        }).deduct,
      ).toBe(true);
    });
  }

  it("수락이 늦어도 요청 시각으로 판단 (승인 시각은 입력에 없다)", () => {
    // 25시간 전에 요청 → 1시간 전에 수락돼도 차감 없음
    expect(
      decideCancelDeduction({
        ...base,
        rules: DEFAULT_RULES,
        requestedAt: new Date(start.getTime() - 25 * HOUR),
      }).deduct,
    ).toBe(false);
  });
});

describe("노쇼 처리 시각 · 24시간 변경 창", () => {
  it("노쇼는 시작 후 판정 시간(10·15·30분)부터", () => {
    expect(noShowAllowedAt(start, DEFAULT_RULES)).toEqual(
      new Date(start.getTime() + 15 * 60_000),
    );
    expect(
      noShowAllowedAt(start, { ...DEFAULT_RULES, noShowMinutes: 30 }),
    ).toEqual(new Date(start.getTime() + 30 * 60_000));
  });
  it("완료 승인 대기에서 노쇼·취소로 바꿀 수 있는 건 종료 후 24시간까지", () => {
    expect(correctionDeadline(end)).toEqual(new Date(end.getTime() + DAY));
  });
});

describe("미승인 기한", () => {
  const requested = end;
  const base = {
    approvalRequestedAt: requested,
    rules: DEFAULT_RULES,
    disputed: false,
  };
  it("기한 전에는 기다린다", () => {
    expect(
      decideApprovalDeadline({
        ...base,
        now: new Date(requested.getTime() + 7 * DAY - 1),
        ruleAgreed: true,
      }),
    ).toBe("WAIT");
  });
  it("동의한 수강생은 7일 뒤 자동 완료", () => {
    expect(
      decideApprovalDeadline({
        ...base,
        now: new Date(requested.getTime() + 7 * DAY),
        ruleAgreed: true,
      }),
    ).toBe("AUTO_COMPLETE");
  });
  it("미동의 수강생은 자동 완료하지 않고 트레이너 확정", () => {
    expect(
      decideApprovalDeadline({
        ...base,
        now: new Date(requested.getTime() + 7 * DAY),
        ruleAgreed: false,
      }),
    ).toBe("NEEDS_TRAINER_CONFIRM");
  });
  it("규칙의 일수를 따른다", () => {
    const rules = { ...DEFAULT_RULES, unapprovedAutoCompleteDays: 3 };
    expect(
      decideApprovalDeadline({
        ...base,
        rules,
        now: new Date(requested.getTime() + 3 * DAY),
        ruleAgreed: true,
      }),
    ).toBe("AUTO_COMPLETE");
  });
  it("거절(이견)된 승인은 기한으로 끝내지 않는다", () => {
    expect(
      decideApprovalDeadline({
        ...base,
        disputed: true,
        now: new Date(requested.getTime() + 30 * DAY),
        ruleAgreed: true,
      }),
    ).toBe("WAIT");
  });
});

describe("이견 처리 기한", () => {
  it("7일 무응답이면 수강생 의견 수락", () => {
    const at = kstDateTime(2026, 11, 21, 10);
    expect(isDisputeOverdue(at, new Date(at.getTime() + 7 * DAY - 1))).toBe(
      false,
    );
    expect(isDisputeOverdue(at, new Date(at.getTime() + 7 * DAY))).toBe(true);
  });
});
