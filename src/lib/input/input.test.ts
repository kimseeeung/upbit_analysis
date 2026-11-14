import { describe, expect, it } from "vitest";
import {
  DURATION_OPTIONS,
  daysInMonth,
  formatDate,
  formatTime,
  minuteOptions,
  parseDate,
  parseTime,
} from "./datetime";
import { hangulToQwerty, hasHangul, keyboardForLabel } from "./keyboard";

describe("한글 자판 → 영문", () => {
  it.each([
    ["ㅅㄱ먀ㅜㄷㄱ1", "trainer1"],
    ["ㅅㄷㄴㅅ1234!", "test1234!"],
    ["ㄴ셩두ㅅ", "student"],
    ["ㅅㄷㄴㅅ", "test"],
    ["abc123", "abc123"],
    ["ㅆㅒ", "TO"],
    ["뷁", "qnpfr"],
    ["값", "rkqt"],
  ])("%s → %s", (a, b) => {
    expect(hangulToQwerty(a)).toBe(b);
  });
  it("한글 포함 여부", () => {
    expect(hasHangul("trainer1")).toBe(false);
    expect(hasHangul("ㅅrainer")).toBe(true);
  });
  it("칸별 기본 언어", () => {
    expect(keyboardForLabel("아이디")).toBe("en");
    expect(keyboardForLabel("새 비밀번호", "password")).toBe("en");
    expect(keyboardForLabel("이름")).toBe("ko");
    expect(keyboardForLabel("메모")).toBe("ko");
    expect(keyboardForLabel("휴대폰 번호", "tel")).toBeNull();
  });
});

describe("날짜·시간 드롭다운", () => {
  it("말일 맞추기", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(formatDate({ y: 2026, m: 2, d: 31 })).toBe("2026-02-28");
    expect(parseDate("2026-11-23")).toEqual({ y: 2026, m: 11, d: 23 });
    expect(parseDate("x")).toBeNull();
  });
  it("오전/오후 12시간제", () => {
    expect(parseTime("00:30")).toEqual({ pm: false, h12: 12, minute: 30 });
    expect(parseTime("12:00")).toEqual({ pm: true, h12: 12, minute: 0 });
    expect(parseTime("19:10")).toEqual({ pm: true, h12: 7, minute: 10 });
    expect(formatTime({ pm: false, h12: 12, minute: 0 })).toBe("00:00");
    expect(formatTime({ pm: true, h12: 12, minute: 0 })).toBe("12:00");
    expect(formatTime({ pm: true, h12: 7, minute: 50 })).toBe("19:50");
  });
  it("분 목록과 수업 시간", () => {
    expect(minuteOptions(10)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(minuteOptions(30, 15)).toEqual([0, 15, 30]);
    expect(DURATION_OPTIONS[0]).toBe(10);
    expect(DURATION_OPTIONS.at(-1)).toBe(120);
    expect(DURATION_OPTIONS).toHaveLength(12);
  });
});
