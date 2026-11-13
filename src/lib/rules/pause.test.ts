import { describe, expect, it } from "vitest";
import {
  addDays,
  checkPauseRequest,
  earlyResume,
  extendedEndDate,
  inclusiveDays,
} from "./pause";

describe("연장 일수 계산", () => {
  it("양 끝을 포함한 일수", () => {
    expect(inclusiveDays("2026-12-01", "2026-12-01")).toBe(1);
    expect(inclusiveDays("2026-12-01", "2026-12-10")).toBe(10);
    expect(inclusiveDays("2026-12-25", "2027-01-05")).toBe(12);
    expect(inclusiveDays("2028-02-28", "2028-03-01")).toBe(3); // 윤년
    expect(inclusiveDays("2026-12-10", "2026-12-01")).toBe(0);
  });

  it("정지한 일수만큼 만료일 연장", () => {
    expect(extendedEndDate("2027-01-31", "2026-12-01", "2026-12-10")).toBe(
      "2027-02-10",
    );
    expect(extendedEndDate("2027-02-20", "2026-12-01", "2026-12-30")).toBe(
      "2027-03-22",
    );
  });

  it("조기 재개: 실제로 쉰 일수만 연장", () => {
    // 12/1~12/10(10일) 정지 승인 → 만료 1/31 → 2/10. 12/5에 재개하면 12/1~12/4(4일)만 쉼
    const r = earlyResume({
      pauseStart: "2026-12-01",
      plannedEnd: "2026-12-10",
      resumeDate: "2026-12-05",
      currentPassEndDate: "2027-02-10",
    });
    expect(r).toEqual({
      actualEnd: "2026-12-04",
      restedDays: 4,
      unusedDays: 6,
      newPassEndDate: "2027-02-04",
    });
    expect(r.newPassEndDate).toBe(addDays("2027-01-31", 4));
  });

  it("시작 전에 재개하면 0일 (연장 전부 되돌림)", () => {
    expect(
      earlyResume({
        pauseStart: "2026-12-01",
        plannedEnd: "2026-12-10",
        resumeDate: "2026-12-01",
        currentPassEndDate: "2027-02-10",
      }),
    ).toEqual({
      actualEnd: null,
      restedDays: 0,
      unusedDays: 10,
      newPassEndDate: "2027-01-31",
    });
  });

  it("마지막 날 다음에 재개하면 다 쉰 것", () => {
    expect(
      earlyResume({
        pauseStart: "2026-12-01",
        plannedEnd: "2026-12-10",
        resumeDate: "2026-12-11",
        currentPassEndDate: "2027-02-10",
      }),
    ).toMatchObject({
      restedDays: 10,
      unusedDays: 0,
      newPassEndDate: "2027-02-10",
    });
  });

  it("월·해를 넘는 연장", () => {
    expect(extendedEndDate("2026-12-31", "2026-12-20", "2026-12-31")).toBe(
      "2027-01-12",
    );
  });
});

describe("일시정지 한도", () => {
  const base = {
    today: "2026-11-13",
    passStartDate: "2026-11-01",
    passEndDate: "2027-01-31",
    usedCount: 0,
    limits: { pauseMaxDays: 30, pauseMaxCount: 2 },
  };
  it("기본 1회 최대 30일", () => {
    expect(
      checkPauseRequest({
        ...base,
        startDate: "2026-12-01",
        endDate: "2026-12-30",
      }),
    ).toEqual({ ok: true, days: 30 });
    expect(
      checkPauseRequest({
        ...base,
        startDate: "2026-12-01",
        endDate: "2026-12-31",
      }).ok,
    ).toBe(false);
  });
  it("이용권당 2회", () => {
    expect(
      checkPauseRequest({
        ...base,
        usedCount: 1,
        startDate: "2026-12-01",
        endDate: "2026-12-05",
      }).ok,
    ).toBe(true);
    expect(
      checkPauseRequest({
        ...base,
        usedCount: 2,
        startDate: "2026-12-01",
        endDate: "2026-12-05",
      }),
    ).toEqual({
      ok: false,
      message: "이 이용권은 일시정지를 2회까지 쓸 수 있습니다",
    });
  });
  it("지난 날짜·기간 밖·순서 오류", () => {
    expect(
      checkPauseRequest({
        ...base,
        startDate: "2026-11-12",
        endDate: "2026-11-20",
      }).ok,
    ).toBe(false);
    expect(
      checkPauseRequest({
        ...base,
        startDate: "2027-02-01",
        endDate: "2027-02-05",
      }).ok,
    ).toBe(false);
    expect(
      checkPauseRequest({
        ...base,
        startDate: "2026-12-05",
        endDate: "2026-12-01",
      }).ok,
    ).toBe(false);
  });
  it("규칙의 한도를 따른다", () => {
    const limits = { pauseMaxDays: 7, pauseMaxCount: 1 };
    expect(
      checkPauseRequest({
        ...base,
        limits,
        startDate: "2026-12-01",
        endDate: "2026-12-08",
      }).ok,
    ).toBe(false);
    expect(
      checkPauseRequest({
        ...base,
        limits,
        startDate: "2026-12-01",
        endDate: "2026-12-07",
      }).ok,
    ).toBe(true);
  });
});
