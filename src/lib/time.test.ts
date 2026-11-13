import { describe, expect, it } from "vitest";
import {
  addKstDays,
  combineKstDateAndTime,
  diffKstCalendarDays,
  formatKstDateTime,
  formatKstMonthDay,
  formatKstShort,
  kstDateTime,
  parseKstDateKey,
  startOfKstDay,
  toKstDateKey,
  toKstParts,
  toKstTimeString,
} from "./time";

describe("한국 시간 유틸", () => {
  it("테스트는 UTC가 아닌 서버 TZ에서 돈다", () => {
    expect(process.env.TZ).toBe("America/Los_Angeles");
  });

  it("UTC 시점을 한국 시간으로 나눈다", () => {
    // 2026-11-13 11:10 UTC = 2026-11-13 20:10 KST (금)
    const p = toKstParts(new Date("2026-11-13T11:10:00Z"));
    expect(p).toEqual({
      year: 2026,
      month: 11,
      day: 13,
      hour: 20,
      minute: 10,
      second: 0,
      weekday: 5,
    });
  });

  it("UTC 기준 전날이어도 한국 날짜로 계산한다", () => {
    // 2026-11-13 15:30 UTC = 2026-11-14 00:30 KST
    const d = new Date("2026-11-13T15:30:00Z");
    expect(toKstDateKey(d)).toBe("2026-11-14");
    expect(toKstParts(d).weekday).toBe(6);
  });

  it("한국 시각으로 UTC 시점을 만든다", () => {
    expect(kstDateTime(2026, 11, 14, 8, 0).toISOString()).toBe(
      "2026-11-13T23:00:00.000Z",
    );
    expect(kstDateTime(2027, 1, 1).toISOString()).toBe(
      "2026-12-31T15:00:00.000Z",
    );
  });

  it("없는 날짜는 거부한다", () => {
    expect(() => kstDateTime(2026, 2, 30)).toThrow(RangeError);
    expect(() => kstDateTime(2026, 13, 1)).toThrow(RangeError);
    expect(() => kstDateTime(2026, 1, 1, 24)).toThrow(RangeError);
    expect(() => toKstParts(new Date("x"))).toThrow(RangeError);
  });

  it("한국 날짜 하루의 시작을 구한다", () => {
    const d = new Date("2026-11-13T16:00:00Z"); // 11/14 01:00 KST
    expect(startOfKstDay(d).toISOString()).toBe("2026-11-13T15:00:00.000Z");
  });

  it("날짜 키를 주고받는다", () => {
    const d = parseKstDateKey("2026-03-01");
    expect(d.toISOString()).toBe("2026-02-28T15:00:00.000Z");
    expect(toKstDateKey(d)).toBe("2026-03-01");
    expect(() => parseKstDateKey("2026-3-1")).toThrow(RangeError);
    expect(() => parseKstDateKey("2026-02-29")).toThrow(RangeError);
  });

  it("날짜와 시각을 합친다", () => {
    expect(combineKstDateAndTime("2026-11-13", "19:00").toISOString()).toBe(
      "2026-11-13T10:00:00.000Z",
    );
    expect(() => combineKstDateAndTime("2026-11-13", "7:00")).toThrow(
      RangeError,
    );
  });

  it("일 더하기와 달력 일수 차이", () => {
    const a = kstDateTime(2026, 12, 31, 23, 0);
    expect(toKstDateKey(addKstDays(a, 1))).toBe("2027-01-01");
    expect(diffKstCalendarDays(a, kstDateTime(2027, 1, 1, 0, 30))).toBe(1);
    expect(diffKstCalendarDays(a, a)).toBe(0);
    expect(
      diffKstCalendarDays(kstDateTime(2026, 11, 20), kstDateTime(2026, 11, 13)),
    ).toBe(-7);
  });

  it("화면 표시 형식", () => {
    const d = new Date("2026-11-13T11:10:00Z");
    expect(toKstTimeString(d)).toBe("20:10");
    expect(formatKstShort(d)).toBe("11/13 20:10");
    expect(formatKstDateTime(d)).toBe("2026-11-13 (금) 20:10");
    expect(formatKstMonthDay(d)).toBe("11월 13일");
  });
});
