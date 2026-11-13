import { describe, expect, it } from "vitest";
import {
  computeTrainerStats,
  remainingAsOf,
  sortRows,
  summarizeStats,
  toCsv,
  trainerOnDate,
  type StatStudent,
} from "./stats";

const T1 = "t1";
const T2 = "t2";

/** 11/15까지 T1 담당, 11/16부터 T2 담당으로 인계된 수강생 */
function handedOver(): StatStudent {
  const pass = {
    id: "p1",
    count: 20,
    bonusCount: 2,
    startDate: "2026-10-01",
    endDate: "2027-01-31",
    status: "ACTIVE",
    soldByTrainerId: T1,
    price: 1_000_000,
    paidAt: "2026-10-01",
  };
  const b = (
    id: string,
    date: string,
    trainerId: string,
    status: string,
    extra: Partial<StatStudent["bookings"][number]> = {},
  ) => ({
    id,
    date,
    trainerId,
    status,
    deducted: status === "COMPLETED" || status === "NO_SHOW",
    passId: status === "COMPLETED" || status === "NO_SHOW" ? "p1" : null,
    lateCancel: false,
    ...extra,
  });
  return {
    id: "s1",
    name: "김인계",
    assignments: [
      { trainerId: T1, start: "2026-10-01", end: "2026-11-15" },
      { trainerId: T2, start: "2026-11-16", end: null },
    ],
    passes: [pass],
    bookings: [
      b("a", "2026-10-20", T1, "COMPLETED"),
      b("b", "2026-11-03", T1, "COMPLETED"),
      b("c", "2026-11-05", T1, "NO_SHOW"),
      b("d", "2026-11-10", T1, "CANCELED", {
        lateCancel: true,
        deducted: true,
        passId: "p1",
      }),
      b("e", "2026-11-20", T2, "COMPLETED"),
      b("f", "2026-11-25", T2, "COMPLETED"),
      b("g", "2026-11-27", T2, "PENDING_APPROVAL"),
      b("h", "2026-11-28", T2, "CANCELED"),
    ],
  };
}

describe("담당 트레이너 (날짜 기준)", () => {
  it("담당 기간으로 찾는다", () => {
    const s = handedOver();
    expect(trainerOnDate(s.assignments, "2026-11-15")).toBe(T1);
    expect(trainerOnDate(s.assignments, "2026-11-16")).toBe(T2);
    expect(trainerOnDate(s.assignments, "2026-09-30")).toBeNull();
  });
});

describe("통계 귀속: 인계된 수강생", () => {
  const s = handedOver();
  const month = {
    from: "2026-11-01",
    to: "2026-11-30",
    today: "2026-11-30",
    students: [s],
  };

  it("수강·노쇼·취소는 수업을 진행한 트레이너에게", () => {
    const [r1] = computeTrainerStats({ ...month, trainerId: T1 });
    expect(r1).toMatchObject({
      completed: 1,
      noShow: 1,
      canceled: 1,
      lateCanceled: 1,
      pendingApproval: 0,
    });
    const [r2] = computeTrainerStats({ ...month, trainerId: T2 });
    expect(r2).toMatchObject({
      completed: 2,
      noShow: 0,
      canceled: 1,
      lateCanceled: 0,
      pendingApproval: 1,
    });
  });

  it("전체 PT·잔여는 조회 종료일 기준 담당 트레이너에게만", () => {
    const [r1] = computeTrainerStats({ ...month, trainerId: T1 });
    expect(r1).toMatchObject({
      isCurrent: false,
      totalPt: null,
      remaining: null,
      expiry: null,
    });
    const [r2] = computeTrainerStats({ ...month, trainerId: T2 });
    // 22회 − 차감(10/20, 11/3, 11/5 노쇼, 11/10 당일 취소, 11/20, 11/25) 6 = 16
    expect(r2).toMatchObject({
      isCurrent: true,
      totalPt: 22,
      remaining: 16,
      expiry: "2027-01-31",
    });
  });

  it("인계 전 기간을 조회하면 이전 트레이너가 담당", () => {
    const early = {
      from: "2026-11-01",
      to: "2026-11-10",
      today: "2026-11-30",
      students: [s],
      trainerId: T1,
    };
    expect(computeTrainerStats(early)[0]).toMatchObject({
      isCurrent: true,
      totalPt: 22,
      completed: 1,
      remaining: 18,
    });
    // T2는 그 기간에 진행한 수업도 담당도 없어 목록에 없다
    expect(computeTrainerStats({ ...early, trainerId: T2 })).toEqual([]);
  });

  it("조회 기간 밖의 수업은 세지 않는다", () => {
    const oct = {
      from: "2026-10-01",
      to: "2026-10-31",
      today: "2026-11-30",
      students: [s],
      trainerId: T1,
    };
    expect(computeTrainerStats(oct)[0]).toMatchObject({
      completed: 1,
      noShow: 0,
      remaining: 21,
    });
  });
});

describe("전체 PT 횟수: 기간에 하루라도 유효했던 이용권", () => {
  it("기간과 겹치는 이용권만 더한다, 환불 제외", () => {
    const s: StatStudent = {
      id: "s2",
      name: "이여럿",
      assignments: [{ trainerId: T1, start: "2026-01-01", end: null }],
      passes: [
        {
          id: "x",
          count: 10,
          bonusCount: 0,
          startDate: "2026-09-01",
          endDate: "2026-11-01",
          status: "EXPIRED",
          soldByTrainerId: T1,
          price: null,
          paidAt: null,
        },
        {
          id: "y",
          count: 20,
          bonusCount: 1,
          startDate: "2026-11-15",
          endDate: "2027-02-15",
          status: "ACTIVE",
          soldByTrainerId: T1,
          price: 900_000,
          paidAt: "2026-11-15",
        },
        {
          id: "z",
          count: 5,
          bonusCount: 0,
          startDate: "2026-12-01",
          endDate: "2027-01-01",
          status: "ACTIVE",
          soldByTrainerId: T1,
          price: null,
          paidAt: null,
        },
        {
          id: "r",
          count: 10,
          bonusCount: 0,
          startDate: "2026-11-01",
          endDate: "2026-12-01",
          status: "REFUNDED",
          soldByTrainerId: T1,
          price: 500_000,
          paidAt: "2026-11-01",
        },
      ],
      bookings: [],
    };
    const [row] = computeTrainerStats({
      trainerId: T1,
      from: "2026-11-01",
      to: "2026-11-30",
      today: "2026-11-20",
      students: [s],
    });
    expect(row.totalPt).toBe(10 + 21);
    expect(row.expiry).toBe("2027-02-15");
    expect(remainingAsOf(s, "2026-11-30")).toBe(21);
    const sum = summarizeStats({
      trainerId: T1,
      from: "2026-11-01",
      to: "2026-11-30",
      rows: [row],
      students: [s],
    });
    expect(sum.paymentSum).toBe(900_000 + 500_000);
  });

  it("만료 7일 이내 강조", () => {
    const s: StatStudent = {
      id: "s3",
      name: "박만료",
      assignments: [{ trainerId: T1, start: "2026-01-01", end: null }],
      passes: [
        {
          id: "p",
          count: 10,
          bonusCount: 0,
          startDate: "2026-10-01",
          endDate: "2026-11-27",
          status: "ACTIVE",
          soldByTrainerId: T1,
          price: null,
          paidAt: null,
        },
      ],
      bookings: [],
    };
    expect(
      computeTrainerStats({
        trainerId: T1,
        from: "2026-11-01",
        to: "2026-11-30",
        today: "2026-11-20",
        students: [s],
      })[0].expirySoon,
    ).toBe(true);
    expect(
      computeTrainerStats({
        trainerId: T1,
        from: "2026-11-01",
        to: "2026-11-30",
        today: "2026-11-19",
        students: [s],
      })[0].expirySoon,
    ).toBe(false);
  });
});

describe("요약·정렬·엑셀", () => {
  const s = handedOver();
  const rows = computeTrainerStats({
    trainerId: T1,
    from: "2026-11-01",
    to: "2026-11-30",
    today: "2026-11-30",
    students: [s],
  });
  it("노쇼율 = 노쇼 / (완료 + 노쇼)", () => {
    expect(
      summarizeStats({
        trainerId: T1,
        from: "2026-11-01",
        to: "2026-11-30",
        rows,
        students: [s],
      }),
    ).toEqual({
      totalClasses: 1,
      noShowRate: 0.5,
      paymentSum: 0,
    });
  });
  it("빈 값은 정렬에서 뒤로", () => {
    const a = { ...rows[0], name: "가", remaining: null };
    const b = { ...rows[0], name: "나", remaining: 3 };
    expect(sortRows([a, b], "remaining", "desc").map((r) => r.name)).toEqual([
      "나",
      "가",
    ]);
    expect(sortRows([a, b], "remaining", "asc").map((r) => r.name)).toEqual([
      "나",
      "가",
    ]);
  });
  it("CSV는 엑셀용 BOM과 한국어 머리말", () => {
    const csv = toCsv(rows);
    expect(csv.startsWith("﻿수강생,전체 PT 횟수")).toBe(true);
    expect(csv).toContain("김인계,,1,1,1,1,0,,");
  });
});
