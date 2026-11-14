import { describe, expect, it, vi } from "vitest";
import { kstDateTime } from "@/lib/time";
import {
  adjustForNight,
  dayBeforeTimeOptions,
  isNight,
  isValidDayBeforeTime,
  planTwoHourReminder,
  quietHoursEnabled,
} from "./night";

// 기본값: 야간 발송 제한 꺼짐 (2026-11-14 사용자 요청)
vi.stubEnv("NEXT_PUBLIC_NOTIFY_QUIET_HOURS", "");

describe("야간 발송 제한 끔 (기본)", () => {
  it("밤에도 바로 보낸다", () => {
    expect(quietHoursEnabled()).toBe(false);
    const night = kstDateTime(2026, 11, 13, 23, 30);
    expect(isNight(night)).toBe(false);
    expect(adjustForNight(night)).toEqual(night);
  });
  it("08시대 수업도 2시간 전 알림을 보낸다", () => {
    const start = kstDateTime(2026, 11, 14, 8, 0);
    const now = kstDateTime(2026, 11, 13, 12, 0);
    expect(planTwoHourReminder(start, now)).toEqual({
      send: true,
      sendAt: kstDateTime(2026, 11, 14, 6, 0),
    });
  });
  it("전일 알림 시각은 하루 전체(30분 간격)", () => {
    expect(dayBeforeTimeOptions()).toHaveLength(48);
    expect(dayBeforeTimeOptions()[0]).toBe("00:00");
    expect(dayBeforeTimeOptions().at(-1)).toBe("23:30");
    expect(isValidDayBeforeTime("22:00")).toBe(true);
  });
});
