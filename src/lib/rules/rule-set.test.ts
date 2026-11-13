import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  describeRules,
  parseRuleValues,
  sameRules,
  suggestEndDate,
} from "./rule-set";

describe("수강 규칙", () => {
  it("기본값 (명세 3.5)", () => {
    expect(DEFAULT_RULES).toMatchObject({
      lateCancelHours: 24,
      lateCancelDeduct: true,
      noShowMinutes: 15,
      noShowDeduct: true,
      unapprovedAutoCompleteDays: 7,
      changeDeadlineHours: 24,
      pauseMaxDays: 30,
      pauseMaxCount: 2,
    });
    expect(parseRuleValues({})).toEqual({ ok: true, value: DEFAULT_RULES });
  });

  it("선택지 밖 값은 거부", () => {
    expect(parseRuleValues({ lateCancelHours: 36 }).ok).toBe(false);
    expect(parseRuleValues({ noShowMinutes: 20 }).ok).toBe(false);
    expect(parseRuleValues({ unapprovedAutoCompleteDays: 0 }).ok).toBe(false);
    expect(parseRuleValues({ lateCancelDeduct: "yes" }).ok).toBe(false);
    expect(
      parseRuleValues({
        lateCancelHours: 48,
        noShowMinutes: 30,
        noShowDeduct: false,
      }).ok,
    ).toBe(true);
  });

  it("지각 기준은 15분 고정", () => {
    const r = parseRuleValues({ lateGraceMinutes: 30 });
    expect(r.ok && r.value.lateGraceMinutes).toBe(15);
  });

  it("규칙 비교", () => {
    expect(sameRules(DEFAULT_RULES, { ...DEFAULT_RULES })).toBe(true);
    expect(
      sameRules(DEFAULT_RULES, { ...DEFAULT_RULES, noShowDeduct: false }),
    ).toBe(false);
  });

  it("규칙 전문", () => {
    const lines = describeRules({ ...DEFAULT_RULES, noShowDeduct: false });
    expect(lines[0].text).toBe("수업 24시간 전 이후에 취소하면 1회 차감됩니다");
    expect(lines[1].text).toContain("차감하지 않습니다");
  });
});

describe("만료일 제안", () => {
  it("20회는 3개월", () => {
    expect(suggestEndDate("2026-11-13", 20)).toBe("2027-02-12");
  });
  it("횟수별 기간", () => {
    expect(suggestEndDate("2026-01-01", 10)).toBe("2026-02-28");
    expect(suggestEndDate("2026-01-01", 30)).toBe("2026-04-30");
    expect(suggestEndDate("2026-01-01", 50)).toBe("2026-06-30");
    expect(suggestEndDate("2026-01-01", 100)).toBe("2026-12-31");
  });
  it("월말 시작은 그 달 마지막 날로 맞춘다", () => {
    expect(suggestEndDate("2026-11-30", 20)).toBe("2027-02-27");
    expect(suggestEndDate("2027-12-31", 10)).toBe("2028-02-28");
  });
});
