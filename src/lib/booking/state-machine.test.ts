import { describe, expect, it } from "vitest";
import {
  STATUS_LABEL,
  TRANSITIONS,
  TransitionError,
  assertTransition,
  canTransition,
  type BookingStatus,
} from "./state-machine";

const ALL = Object.keys(STATUS_LABEL) as BookingStatus[];
const start = new Date("2026-11-20T10:00:00Z");
const end = new Date("2026-11-20T10:50:00Z");
const HOUR = 3600_000;
const ctx = (now: Date, extra: object = {}) => ({
  now,
  startAt: start,
  endAt: end,
  ...extra,
});
const afterEnd = new Date(end.getTime() + HOUR);

/** 명세 4.1 표 (+ docs/05 가정) */
const EXPECTED: Record<BookingStatus, BookingStatus[]> = {
  REQUESTED: ["CONFIRMED", "REJECTED", "EXPIRED", "CANCELED", "INSUFFICIENT"],
  PENDING_CONFIRM: ["CONFIRMED", "REJECTED", "CANCELED", "INSUFFICIENT"],
  CONFIRMED: ["PENDING_APPROVAL", "NO_SHOW", "CANCELED", "INSUFFICIENT"],
  INSUFFICIENT: ["CONFIRMED", "PENDING_CONFIRM", "REQUESTED", "CANCELED"],
  PENDING_APPROVAL: ["COMPLETED", "NO_SHOW", "CANCELED"],
  COMPLETED: [],
  NO_SHOW: ["CANCELED"],
  CANCELED: [],
  REJECTED: [],
  EXPIRED: [],
};

describe("상태 전이 표 전체", () => {
  it("표가 명세와 같다", () => {
    for (const s of ALL)
      expect([...TRANSITIONS[s]].sort()).toEqual([...EXPECTED[s]].sort());
  });

  // 모든 (from, to) 조합: 표에 없으면 거부
  for (const from of ALL) {
    for (const to of ALL) {
      const allowed = EXPECTED[from].includes(to);
      it(`${STATUS_LABEL[from]} → ${STATUS_LABEL[to]}: ${allowed ? "허용" : "거부"}`, () => {
        const c = ctx(afterEnd, {
          prevStatus: from === "INSUFFICIENT" ? to : undefined,
          viaDispute: true,
        });
        if (allowed) expect(() => assertTransition(from, to, c)).not.toThrow();
        else
          expect(() => assertTransition(from, to, c)).toThrow(TransitionError);
      });
    }
  }
});

describe("조건이 붙은 전이", () => {
  it("완료는 트레이너 혼자 되돌릴 수 없다 (종료 상태)", () => {
    for (const to of ALL)
      expect(canTransition("COMPLETED", to, ctx(afterEnd))).toBe(false);
  });

  it("완료 승인 대기 → 노쇼·취소는 종료 후 24시간 안에만", () => {
    const in24 = new Date(end.getTime() + 24 * HOUR);
    const over = new Date(end.getTime() + 24 * HOUR + 1);
    expect(canTransition("PENDING_APPROVAL", "NO_SHOW", ctx(in24))).toBe(true);
    expect(canTransition("PENDING_APPROVAL", "CANCELED", ctx(in24))).toBe(true);
    expect(canTransition("PENDING_APPROVAL", "NO_SHOW", ctx(over))).toBe(false);
    expect(canTransition("PENDING_APPROVAL", "CANCELED", ctx(over))).toBe(
      false,
    );
    expect(canTransition("PENDING_APPROVAL", "COMPLETED", ctx(over))).toBe(
      true,
    );
  });

  it("노쇼는 수업 시작 후에만", () => {
    expect(
      canTransition("CONFIRMED", "NO_SHOW", ctx(new Date(start.getTime() - 1))),
    ).toBe(false);
    expect(canTransition("CONFIRMED", "NO_SHOW", ctx(start))).toBe(true);
  });

  it("완료 승인 요청은 수업 종료 후", () => {
    expect(canTransition("CONFIRMED", "PENDING_APPROVAL", ctx(start))).toBe(
      false,
    );
    expect(canTransition("CONFIRMED", "PENDING_APPROVAL", ctx(end))).toBe(true);
  });

  it("노쇼 → 취소는 이견 처리 결과일 때만", () => {
    expect(canTransition("NO_SHOW", "CANCELED", ctx(afterEnd))).toBe(false);
    expect(
      canTransition("NO_SHOW", "CANCELED", ctx(afterEnd, { viaDispute: true })),
    ).toBe(true);
  });

  it("잔여 부족은 원래 상태로만 복구", () => {
    expect(
      canTransition(
        "INSUFFICIENT",
        "CONFIRMED",
        ctx(start, { prevStatus: "CONFIRMED" }),
      ),
    ).toBe(true);
    expect(
      canTransition(
        "INSUFFICIENT",
        "PENDING_CONFIRM",
        ctx(start, { prevStatus: "CONFIRMED" }),
      ),
    ).toBe(false);
    expect(
      canTransition(
        "INSUFFICIENT",
        "PENDING_CONFIRM",
        ctx(start, { prevStatus: "PENDING_CONFIRM" }),
      ),
    ).toBe(true);
    expect(
      canTransition(
        "INSUFFICIENT",
        "CANCELED",
        ctx(start, { prevStatus: "REQUESTED" }),
      ),
    ).toBe(true);
  });
});
