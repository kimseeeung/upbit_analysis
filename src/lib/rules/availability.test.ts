import { describe, expect, it } from "vitest";
import {
  allocateBookings,
  computeAvailableCount,
  computeRemaining,
  pickBookableDates,
  type BookingForCount,
  type PassForCount,
} from "./availability";

function pass(p: Partial<PassForCount> & { id: string }): PassForCount {
  return {
    count: 10,
    bonusCount: 0,
    startDate: "2026-11-01",
    endDate: "2027-01-31",
    status: "ACTIVE",
    ...p,
  };
}

let n = 0;
function booking(
  date: string,
  status: BookingForCount["status"],
  extra: Partial<BookingForCount> = {},
): BookingForCount {
  n += 1;
  return {
    id: extra.id ?? `b${n}`,
    date,
    startAt: `${date}T10:00:00.000Z`,
    status,
    deducted: false,
    ...extra,
  };
}
const done = (
  date: string,
  passId: string,
  status: BookingForCount["status"] = "COMPLETED",
) => booking(date, status, { deducted: true, passId });

describe("잔여 횟수 = (등록 + 서비스) − 차감", () => {
  it("완료·차감된 노쇼·차감된 당일 취소를 뺀다", () => {
    const p = pass({ id: "p1", count: 20, bonusCount: 2 });
    const bookings = [
      done("2026-11-02", "p1"),
      done("2026-11-03", "p1"),
      done("2026-11-04", "p1", "NO_SHOW"),
      done("2026-11-05", "p1", "CANCELED"), // 당일 취소 차감
      booking("2026-11-06", "NO_SHOW"), // 차감 안 한 노쇼 (미동의)
      booking("2026-11-07", "CANCELED"), // 차감 없는 취소
      done("2026-11-08", "other"), // 다른 이용권
    ];
    expect(computeRemaining(p, bookings)).toBe(22 - 4);
  });

  it("음수가 되지 않는다", () => {
    const p = pass({ id: "p1", count: 1 });
    expect(
      computeRemaining(p, [done("2026-11-02", "p1"), done("2026-11-03", "p1")]),
    ).toBe(0);
  });
});

describe("예약 가능 횟수", () => {
  it("잔여 − 예정 예약 (확정 대기·확정·신청 대기·완료 승인 대기)", () => {
    const p = pass({ id: "p1", count: 10 });
    const bookings = [
      done("2026-11-02", "p1"),
      booking("2026-11-20", "PENDING_CONFIRM"),
      booking("2026-11-21", "CONFIRMED"),
      booking("2026-11-22", "REQUESTED"),
      booking("2026-11-12", "PENDING_APPROVAL"),
      booking("2026-11-23", "CANCELED"),
      booking("2026-11-24", "REJECTED"),
      booking("2026-11-25", "EXPIRED"),
    ];
    // 잔여 9, 예정 4
    expect(computeAvailableCount([p], bookings, "2026-11-30")).toBe(5);
  });

  it("0이 되면 더 잡을 수 없다", () => {
    const p = pass({ id: "p1", count: 2 });
    const bookings = [
      booking("2026-11-20", "CONFIRMED"),
      booking("2026-11-21", "CONFIRMED"),
    ];
    expect(computeAvailableCount([p], bookings, "2026-11-22")).toBe(0);
  });

  it("이용권이 없으면 0", () => {
    expect(computeAvailableCount([], [], "2026-11-22")).toBe(0);
  });

  describe("만료", () => {
    const p = pass({
      id: "p1",
      count: 10,
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    });
    it("만료일 당일은 가능, 다음 날부터 불가", () => {
      expect(computeAvailableCount([p], [], "2026-11-30")).toBe(10);
      expect(computeAvailableCount([p], [], "2026-12-01")).toBe(0);
    });
    it("시작일 전에도 불가", () => {
      expect(computeAvailableCount([p], [], "2026-10-31")).toBe(0);
    });
    it("만료된 이용권에 예정 예약이 남아 있으면 그 예약은 잔여 부족 대상", () => {
      const late = booking("2026-12-05", "CONFIRMED", { id: "late" });
      expect(allocateBookings([p], [late]).overflow).toEqual(["late"]);
    });
  });

  it("일시정지 기간에는 불가, 기간 밖은 가능", () => {
    const p = pass({
      id: "p1",
      count: 10,
      pauses: [{ startDate: "2026-12-01", endDate: "2026-12-10" }],
    });
    expect(computeAvailableCount([p], [], "2026-12-01")).toBe(0);
    expect(computeAvailableCount([p], [], "2026-12-10")).toBe(0);
    expect(computeAvailableCount([p], [], "2026-12-11")).toBe(10);
    expect(computeAvailableCount([p], [], "2026-11-30")).toBe(10);
  });

  it("환불·사용 중지 이용권은 세지 않는다", () => {
    expect(
      computeAvailableCount(
        [pass({ id: "a", status: "REFUNDED" })],
        [],
        "2026-11-20",
      ),
    ).toBe(0);
    expect(
      computeAvailableCount(
        [pass({ id: "a", status: "SUSPENDED" })],
        [],
        "2026-11-20",
      ),
    ).toBe(0);
  });

  it("예약 하나를 빼고 다시 센다 (신청 수락 시 재확인)", () => {
    const p = pass({ id: "p1", count: 1 });
    const req = booking("2026-11-20", "REQUESTED", { id: "req" });
    expect(computeAvailableCount([p], [req], "2026-11-20")).toBe(0);
    expect(
      computeAvailableCount([p], [req], "2026-11-20", {
        excludeBookingId: "req",
      }),
    ).toBe(1);
  });
});

describe("여러 이용권", () => {
  const a = pass({
    id: "A",
    count: 3,
    startDate: "2026-10-01",
    endDate: "2026-11-30",
  });
  const b = pass({
    id: "B",
    count: 10,
    startDate: "2026-11-15",
    endDate: "2027-02-28",
  });

  it("수업 날짜에 유효한 이용권들의 잔여 합", () => {
    expect(computeAvailableCount([a, b], [], "2026-11-10")).toBe(3); // A만
    expect(computeAvailableCount([a, b], [], "2026-11-20")).toBe(13); // A + B
    expect(computeAvailableCount([a, b], [], "2026-12-05")).toBe(10); // B만
  });

  it("이전 이용권부터 배정한다", () => {
    const bookings = [
      booking("2026-11-20", "CONFIRMED", { id: "x1" }),
      booking("2026-11-21", "CONFIRMED", { id: "x2" }),
    ];
    const alloc = allocateBookings([b, a], bookings);
    expect(alloc.assignment).toEqual({ x1: "A", x2: "A" });
    expect(computeAvailableCount([a, b], bookings, "2026-11-25")).toBe(1 + 10);
    expect(computeAvailableCount([a, b], bookings, "2026-12-05")).toBe(10);
  });

  it("앞 이용권이 다 차면 다음 이용권으로 넘어간다", () => {
    const bookings = ["11-16", "11-17", "11-18", "11-19"].map((d, i) =>
      booking(`2026-${d}`, "CONFIRMED", { id: `y${i}` }),
    );
    const alloc = allocateBookings([a, b], bookings);
    expect(alloc.assignment).toEqual({ y0: "A", y1: "A", y2: "A", y3: "B" });
    expect(computeAvailableCount([a, b], bookings, "2026-12-05")).toBe(9);
    expect(computeAvailableCount([a, b], bookings, "2026-11-20")).toBe(9);
  });

  it("만료일이 지난 날짜의 예약은 그 이용권을 쓰지 않는다", () => {
    const bookings = [booking("2026-12-10", "CONFIRMED", { id: "z" })];
    expect(allocateBookings([a, b], bookings).assignment).toEqual({ z: "B" });
    expect(computeAvailableCount([a, b], bookings, "2026-11-20")).toBe(3 + 9);
  });

  it("차감은 실제로 차감한 이용권에서 빠진다", () => {
    const bookings = [
      done("2026-11-02", "A"),
      done("2026-11-03", "A"),
      done("2026-11-16", "B"),
    ];
    expect(computeAvailableCount([a, b], bookings, "2026-11-20")).toBe(1 + 9);
  });
});

describe("잔여 부족 (초과 예약)", () => {
  it("차감으로 잔여보다 예약이 많아지면 가장 나중 예약이 넘친다", () => {
    const p = pass({ id: "p1", count: 3 });
    const bookings = [
      done("2026-11-02", "p1", "NO_SHOW"),
      booking("2026-11-20", "CONFIRMED", { id: "c1" }),
      booking("2026-11-27", "CONFIRMED", { id: "c3" }),
      booking("2026-11-22", "PENDING_CONFIRM", { id: "c2" }),
    ];
    expect(allocateBookings([p], bookings).overflow).toEqual(["c3"]);
    expect(computeAvailableCount([p], bookings, "2026-11-28")).toBe(0);
  });

  it("이용권이 추가되면 잔여 부족 예약도 배정된다 (복구 대상)", () => {
    const p1 = pass({ id: "p1", count: 1 });
    const bookings = [
      booking("2026-11-20", "CONFIRMED", { id: "ok" }),
      booking("2026-11-27", "INSUFFICIENT", { id: "short" }),
    ];
    expect(allocateBookings([p1], bookings).overflow).toEqual(["short"]);
    const p2 = pass({ id: "p2", count: 5, startDate: "2026-11-15" });
    const alloc = allocateBookings([p1, p2], bookings);
    expect(alloc.overflow).toEqual([]);
    expect(alloc.assignment.short).toBe("p2");
    expect(computeAvailableCount([p1, p2], bookings, "2026-11-28")).toBe(4);
  });

  it("잔여 부족 예약은 다른 예정 예약보다 나중에 배정한다", () => {
    const p = pass({ id: "p1", count: 1 });
    const bookings = [
      booking("2026-11-20", "INSUFFICIENT", { id: "short" }),
      booking("2026-11-25", "CONFIRMED", { id: "ok" }),
    ];
    expect(allocateBookings([p], bookings).overflow).toEqual(["short"]);
  });
});

describe("반복 예약: 예약 가능 횟수만큼만", () => {
  it("앞에서부터 잡을 수 있는 만큼만 고르고 나머지는 건너뛴다", () => {
    const p = pass({ id: "p1", count: 5, endDate: "2026-12-15" });
    const existing = [booking("2026-11-20", "CONFIRMED")];
    const slots = [
      "11-23",
      "11-25",
      "11-30",
      "12-02",
      "12-07",
      "12-09",
      "12-14",
      "12-16",
    ].map((d) => ({
      date: `2026-${d}`,
      startAt: `2026-${d}T10:00:00.000Z`,
    }));
    const r = pickBookableDates([p], existing, slots);
    expect(r.bookable).toEqual([0, 1, 2, 3]);
    expect(r.skipped).toEqual([4, 5, 6, 7]);
  });

  it("만료일 뒤 날짜는 건너뛰고 앞의 날짜는 잡는다", () => {
    const p = pass({ id: "p1", count: 10, endDate: "2026-11-30" });
    const slots = ["11-28", "12-01", "11-29"].map((d) => ({
      date: `2026-${d}`,
      startAt: `2026-${d}T10:00:00Z`,
    }));
    expect(pickBookableDates([p], [], slots)).toEqual({
      bookable: [0, 2],
      skipped: [1],
    });
  });
});
