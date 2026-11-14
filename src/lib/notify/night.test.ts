import { describe, expect, it, vi } from "vitest";
import { kstDateTime, toKstParts } from "@/lib/time";
import {
  dayBeforeTimeOptions,
  NIGHT_NOTICE,
  adjustForNight,
  dayBeforeAt,
  isNight,
  planDayBeforeReminder,
  planReminder,
  planTwoHourReminder,
} from "./night";

// 야간 발송 제한을 켠 상태의 규칙 검사 (기본은 꺼짐)
vi.stubEnv("NEXT_PUBLIC_NOTIFY_QUIET_HOURS", "1");

const MIN = 60_000;
const HOUR = 60 * MIN;

describe("야간 판단 (21:00~08:00)", () => {
  it("경계", () => {
    expect(isNight(kstDateTime(2026, 11, 13, 20, 59))).toBe(false);
    expect(isNight(kstDateTime(2026, 11, 13, 21, 0))).toBe(true);
    expect(isNight(kstDateTime(2026, 11, 14, 7, 59))).toBe(true);
    expect(isNight(kstDateTime(2026, 11, 14, 8, 0))).toBe(false);
  });
});

describe("21:00~08:00 발송 0건", () => {
  it("하루 24시간 1분 간격 어느 시각이든 보정하면 야간이 아니다", () => {
    const start = kstDateTime(2026, 11, 13, 0, 0);
    for (let m = 0; m < 24 * 60; m++) {
      const at = new Date(start.getTime() + m * MIN);
      const sendAt = adjustForNight(at);
      expect(
        isNight(sendAt),
        `${at.toISOString()} → ${sendAt.toISOString()}`,
      ).toBe(false);
      expect(sendAt.getTime()).toBeGreaterThanOrEqual(at.getTime());
    }
  });

  it("야간 알림은 다음 08:00에", () => {
    expect(adjustForNight(kstDateTime(2026, 11, 13, 22, 30))).toEqual(
      kstDateTime(2026, 11, 14, 8, 0),
    );
    expect(adjustForNight(kstDateTime(2026, 11, 14, 3, 0))).toEqual(
      kstDateTime(2026, 11, 14, 8, 0),
    );
    expect(adjustForNight(kstDateTime(2026, 12, 31, 23, 0))).toEqual(
      kstDateTime(2027, 1, 1, 8, 0),
    );
    expect(adjustForNight(kstDateTime(2026, 11, 14, 9, 0))).toEqual(
      kstDateTime(2026, 11, 14, 9, 0),
    );
  });

  it("서버 시간대와 관계없이 한국 시간 기준", () => {
    expect(
      toKstParts(adjustForNight(new Date("2026-11-13T12:30:00Z"))).hour,
    ).toBe(8); // 21:30 KST
  });
});

describe("2시간 전 알림", () => {
  it("낮 수업은 2시간 전에", () => {
    const start = kstDateTime(2026, 11, 20, 19);
    expect(planTwoHourReminder(start, kstDateTime(2026, 11, 13, 10))).toEqual({
      send: true,
      sendAt: kstDateTime(2026, 11, 20, 17),
    });
  });

  it("08시대 수업은 2시간 전(06시대)이 야간 → 08:00이 수업 1시간 전보다 늦어 생략", () => {
    const now = kstDateTime(2026, 11, 13, 10);
    for (const minute of [0, 15, 30, 59]) {
      const start = kstDateTime(2026, 11, 20, 8, minute);
      expect(planTwoHourReminder(start, now)).toEqual({
        send: false,
        reason: "TOO_LATE_AFTER_NIGHT",
      });
    }
  });

  it("09:00 수업: 07:00이 야간 → 08:00 = 수업 1시간 전이라 보낸다", () => {
    expect(
      planTwoHourReminder(
        kstDateTime(2026, 11, 20, 9),
        kstDateTime(2026, 11, 13, 10),
      ),
    ).toEqual({
      send: true,
      sendAt: kstDateTime(2026, 11, 20, 8),
    });
  });

  it("09:30 수업: 07:30 → 08:00에 보낸다", () => {
    expect(
      planTwoHourReminder(
        kstDateTime(2026, 11, 20, 9, 30),
        kstDateTime(2026, 11, 13, 10),
      ),
    ).toMatchObject({
      send: true,
      sendAt: kstDateTime(2026, 11, 20, 8),
    });
  });

  it("22:30 수업: 20:30에 보낸다 (야간 아님)", () => {
    expect(
      planTwoHourReminder(
        kstDateTime(2026, 11, 20, 22, 30),
        kstDateTime(2026, 11, 13, 10),
      ),
    ).toMatchObject({
      send: true,
      sendAt: kstDateTime(2026, 11, 20, 20, 30),
    });
  });

  it("23:30 수업: 21:30이 야간 → 다음 날 08:00은 수업 뒤라 생략", () => {
    expect(
      planTwoHourReminder(
        kstDateTime(2026, 11, 20, 23, 30),
        kstDateTime(2026, 11, 13, 10),
      ),
    ).toEqual({
      send: false,
      reason: "TOO_LATE_AFTER_NIGHT",
    });
  });

  it("예약을 당일에 잡아 알림 시각이 지났으면 보내지 않는다", () => {
    const start = kstDateTime(2026, 11, 20, 19);
    expect(
      planTwoHourReminder(start, new Date(start.getTime() - 90 * MIN)),
    ).toEqual({ send: false, reason: "PAST" });
  });

  it("어떤 수업 시각이든 발송 시각은 야간이 아니고 수업 1시간 전 이전", () => {
    const now = kstDateTime(2026, 11, 1, 10);
    const base = kstDateTime(2026, 11, 20, 0, 0);
    for (let m = 0; m < 24 * 60; m += 10) {
      const start = new Date(base.getTime() + m * MIN);
      const plan = planTwoHourReminder(start, now);
      if (plan.send) {
        expect(isNight(plan.sendAt)).toBe(false);
        expect(plan.sendAt.getTime()).toBeLessThanOrEqual(
          start.getTime() - HOUR,
        );
      }
    }
  });
});

describe("전일 알림", () => {
  it("수업 전날 정한 시각 (한국 날짜 기준)", () => {
    expect(dayBeforeAt(kstDateTime(2026, 11, 20, 7), "20:00")).toEqual(
      kstDateTime(2026, 11, 19, 20),
    );
    expect(dayBeforeAt(kstDateTime(2026, 12, 1, 0, 30), "08:00")).toEqual(
      kstDateTime(2026, 11, 30, 8),
    );
  });
  it("고를 수 있는 시각은 08:00~20:30", () => {
    expect(dayBeforeTimeOptions()[0]).toBe("08:00");
    expect(dayBeforeTimeOptions().at(-1)).toBe("20:30");
    expect(
      dayBeforeTimeOptions().every(
        (t) =>
          !isNight(
            kstDateTime(
              2026,
              11,
              13,
              ...(t.split(":").map(Number) as [number, number]),
            ),
          ),
      ),
    ).toBe(true);
  });
  it("당일에 잡은 예약은 전일 알림 시각이 지나 보내지 않는다", () => {
    const start = kstDateTime(2026, 11, 20, 19);
    expect(
      planDayBeforeReminder(start, "20:00", kstDateTime(2026, 11, 20, 9)),
    ).toEqual({ send: false, reason: "PAST" });
    expect(
      planDayBeforeReminder(start, "20:00", kstDateTime(2026, 11, 19, 19)),
    ).toEqual({
      send: true,
      sendAt: kstDateTime(2026, 11, 19, 20),
    });
  });
  it("planReminder: 지났으면 PAST", () => {
    expect(
      planReminder(kstDateTime(2026, 11, 13, 9), kstDateTime(2026, 11, 13, 10)),
    ).toEqual({ send: false, reason: "PAST" });
  });
});

describe("주석 문구", () => {
  it("8.3의 문장 그대로", () => {
    expect(NIGHT_NOTICE).toBe(
      "※ 정보통신망법 제50조 제3항에 따라 오후 9시부터 다음 날 오전 8시까지는 별도 동의 없이 광고성 정보를 보낼 수 없습니다. 이 서비스는 수업 안내 알림도 같은 시간에는 보내지 않습니다.",
    );
  });
});
