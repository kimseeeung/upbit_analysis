import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "@/lib/rules/rule-set";
import { kstDateTime, toKstTimeString } from "@/lib/time";
import { decideCancelDeduction } from "./deduction";
import {
  canRequestChange,
  changeRequestExpiresAt,
  insufficientCancelAt,
  isWithinWorkingHours,
  openSlots,
  overlaps,
  requestExpiresAt,
  weeklySlots,
  workingRangesOn,
} from "./schedule";

const HOUR = 3600_000;
// 2026-11-16 월요일
const rules = [
  { weekday: 1, startTime: "09:00", endTime: "12:00" },
  { weekday: 1, startTime: "18:00", endTime: "22:00" },
  { weekday: 3, startTime: "10:00", endTime: "20:00" },
];

describe("시간 겹침 (같은 시간 중복 차단)", () => {
  const a = {
    start: kstDateTime(2026, 11, 16, 10),
    end: kstDateTime(2026, 11, 16, 10, 50),
  };
  it("겹치면 true, 맞닿기만 하면 false", () => {
    expect(
      overlaps(a, {
        start: kstDateTime(2026, 11, 16, 10, 30),
        end: kstDateTime(2026, 11, 16, 11, 20),
      }),
    ).toBe(true);
    expect(
      overlaps(a, {
        start: kstDateTime(2026, 11, 16, 9, 0),
        end: kstDateTime(2026, 11, 16, 12, 0),
      }),
    ).toBe(true);
    expect(
      overlaps(a, {
        start: kstDateTime(2026, 11, 16, 10, 50),
        end: kstDateTime(2026, 11, 16, 11, 40),
      }),
    ).toBe(false);
    expect(
      overlaps(a, {
        start: kstDateTime(2026, 11, 16, 9, 10),
        end: kstDateTime(2026, 11, 16, 10, 0),
      }),
    ).toBe(false);
  });
});

describe("근무 가능 시간", () => {
  it("요일별 시간대", () => {
    expect(
      workingRangesOn("2026-11-16", rules, []).map((r) =>
        toKstTimeString(r.start),
      ),
    ).toEqual(["09:00", "18:00"]);
    expect(workingRangesOn("2026-11-17", rules, [])).toEqual([]);
  });
  it("휴무일·예외일", () => {
    expect(
      workingRangesOn("2026-11-16", rules, [
        { date: "2026-11-16", isOff: true },
      ]),
    ).toEqual([]);
    const ex = workingRangesOn("2026-11-17", rules, [
      {
        date: "2026-11-17",
        isOff: false,
        startTime: "13:00",
        endTime: "15:00",
      },
    ]);
    expect(
      ex.map((r) => [toKstTimeString(r.start), toKstTimeString(r.end)]),
    ).toEqual([["13:00", "15:00"]]);
  });
  it("수업 전체가 시간대 안에 있어야 한다", () => {
    const at = (h: number, m = 0) => kstDateTime(2026, 11, 16, h, m);
    expect(
      isWithinWorkingHours({ start: at(11, 10), end: at(12, 0) }, rules, []),
    ).toBe(true);
    expect(
      isWithinWorkingHours({ start: at(11, 30), end: at(12, 20) }, rules, []),
    ).toBe(false);
    expect(
      isWithinWorkingHours({ start: at(13), end: at(13, 50) }, rules, []),
    ).toBe(false);
  });
});

describe("수강생이 볼 빈 시간", () => {
  it("근무 시간 안, 30분 간격, 수업 길이 칸, 바쁜 시간 제외, 12시간 전까지", () => {
    const slots = openSlots({
      from: "2026-11-16",
      to: "2026-11-16",
      sessionMinutes: 50,
      rules,
      exceptions: [],
      busy: [
        {
          start: kstDateTime(2026, 11, 16, 19),
          end: kstDateTime(2026, 11, 16, 19, 50),
        },
      ],
      now: kstDateTime(2026, 11, 15, 22, 0), // 12시간 뒤 = 11/16 10:00
    });
    expect(slots.map((s) => toKstTimeString(s.start))).toEqual([
      "10:00",
      "10:30",
      "11:00",
      "18:00",
      // 18:30·19:00·19:30 은 19:00~19:50 예약과 겹침
      "20:00",
      "20:30",
      "21:00",
    ]);
  });
});

describe("반복 예약", () => {
  it("매주 월·수 19시 8회", () => {
    const s = weeklySlots({
      startDate: "2026-11-16",
      weekdays: [1, 3],
      time: "19:00",
      durationMinutes: 50,
      count: 8,
    });
    expect(s).toHaveLength(8);
    expect(s[0].start).toEqual(kstDateTime(2026, 11, 16, 19));
    expect(s[1].start).toEqual(kstDateTime(2026, 11, 18, 19));
    expect(s[7].start).toEqual(kstDateTime(2026, 12, 9, 19));
    expect(s[7].end).toEqual(kstDateTime(2026, 12, 9, 19, 50));
  });
});

describe("기한", () => {
  const start = kstDateTime(2026, 11, 20, 19);
  it("신청은 수업 12시간 전에 만료", () => {
    expect(requestExpiresAt(start)).toEqual(kstDateTime(2026, 11, 20, 7));
  });
  it("변경 요청은 원래·새 시간 중 빠른 시각에 만료", () => {
    expect(
      changeRequestExpiresAt(start, [
        kstDateTime(2026, 11, 19, 10),
        kstDateTime(2026, 11, 21, 10),
      ]),
    ).toEqual(kstDateTime(2026, 11, 19, 10));
    expect(
      changeRequestExpiresAt(start, [kstDateTime(2026, 11, 22, 10)]),
    ).toEqual(start);
  });
  it("변경 요청은 규칙의 기한까지", () => {
    expect(
      canRequestChange(start, new Date(start.getTime() - 24 * HOUR), 24),
    ).toBe(true);
    expect(
      canRequestChange(start, new Date(start.getTime() - 24 * HOUR + 1), 24),
    ).toBe(false);
  });
  it("잔여 부족 자동 취소: 24시간 전, 24시간 이내에 생겼으면 2시간 전", () => {
    expect(insufficientCancelAt(start, kstDateTime(2026, 11, 15, 10))).toEqual(
      kstDateTime(2026, 11, 19, 19),
    );
    expect(insufficientCancelAt(start, kstDateTime(2026, 11, 20, 8))).toEqual(
      kstDateTime(2026, 11, 20, 17),
    );
  });
});

describe("당일 취소 차감 (요청 시각 기준)", () => {
  const start = kstDateTime(2026, 11, 20, 19);
  const base = {
    kind: "STUDENT_REQUEST" as const,
    startAt: start,
    rules: DEFAULT_RULES,
    ruleAgreed: true,
  };
  it("24시간 전보다 일찍 요청하면 차감 없음", () => {
    expect(
      decideCancelDeduction({
        ...base,
        requestedAt: kstDateTime(2026, 11, 19, 18),
      }).deduct,
    ).toBe(false);
    expect(
      decideCancelDeduction({
        ...base,
        requestedAt: kstDateTime(2026, 11, 19, 19),
      }).deduct,
    ).toBe(false);
  });
  it("24시간 전 이후에 요청하면 1회 차감 (늦게 수락돼도 요청 시각 기준)", () => {
    expect(
      decideCancelDeduction({
        ...base,
        requestedAt: kstDateTime(2026, 11, 19, 19, 1),
      }),
    ).toEqual({
      deduct: true,
      lateCancel: true,
      skippedReason: null,
    });
  });
  it("규칙 미동의면 기록만 하고 차감 안 함", () => {
    expect(
      decideCancelDeduction({
        ...base,
        ruleAgreed: false,
        requestedAt: kstDateTime(2026, 11, 20, 10),
      }),
    ).toEqual({
      deduct: false,
      lateCancel: true,
      skippedReason: "NO_CONSENT",
    });
  });
  it("규칙이 '차감 안 함'이면 차감 없음", () => {
    expect(
      decideCancelDeduction({
        ...base,
        rules: { ...DEFAULT_RULES, lateCancelDeduct: false },
        requestedAt: kstDateTime(2026, 11, 20, 10),
      }).deduct,
    ).toBe(false);
  });
  it("트레이너·시스템 취소는 차감 없음", () => {
    expect(
      decideCancelDeduction({ ...base, kind: "TRAINER", requestedAt: null })
        .deduct,
    ).toBe(false);
    expect(
      decideCancelDeduction({
        ...base,
        kind: "SYSTEM",
        requestedAt: kstDateTime(2026, 11, 20, 18),
      }).deduct,
    ).toBe(false);
  });
  it("6시간 기준", () => {
    const r6 = { ...DEFAULT_RULES, lateCancelHours: 6 };
    expect(
      decideCancelDeduction({
        ...base,
        rules: r6,
        requestedAt: kstDateTime(2026, 11, 20, 12, 59),
      }).deduct,
    ).toBe(false);
    expect(
      decideCancelDeduction({
        ...base,
        rules: r6,
        requestedAt: kstDateTime(2026, 11, 20, 13, 1),
      }).deduct,
    ).toBe(true);
  });
});
