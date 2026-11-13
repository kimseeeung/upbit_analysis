import { describe, expect, it } from "vitest";
import {
  canCenterApprovePassTransfer,
  centerCanSee,
  centerCanSeeContact,
  currentMembers,
  departureDeadline,
  departureDefault,
  departureOptions,
  visibleTrainers,
  type MembershipWindow,
} from "./scope";

const d = (s: string) => new Date(`${s}T00:00:00+09:00`);

const windows: MembershipWindow[] = [
  { trainerId: "kim", joinedAt: d("2026-01-01"), leftAt: null },
  // 이동한 트레이너: 2026-03-01 ~ 2026-11-01
  { trainerId: "lee", joinedAt: d("2026-03-01"), leftAt: d("2026-11-01") },
];

describe("센터는 소속 범위만", () => {
  it("지금 소속 트레이너의 기록", () => {
    expect(centerCanSee(windows, "kim", d("2026-11-13"))).toBe(true);
    expect(centerCanSee(windows, "kim", d("2025-12-31"))).toBe(false);
  });

  it("소속하지 않은 트레이너는 볼 수 없다", () => {
    expect(centerCanSee(windows, "park", d("2026-11-13"))).toBe(false);
  });

  it("이동한 트레이너는 이동 전 기간만", () => {
    expect(centerCanSee(windows, "lee", d("2026-02-28"))).toBe(false);
    expect(centerCanSee(windows, "lee", d("2026-03-01"))).toBe(true);
    expect(centerCanSee(windows, "lee", d("2026-10-31"))).toBe(true);
    expect(centerCanSee(windows, "lee", d("2026-11-01"))).toBe(false);
    expect(centerCanSee(windows, "lee", d("2026-12-01"))).toBe(false);
  });

  it("지금 소속과 지금·과거 소속", () => {
    expect(currentMembers(windows)).toEqual(["kim"]);
    expect(visibleTrainers(windows).sort()).toEqual(["kim", "lee"]);
  });

  it("다시 가입하면 두 기간 모두", () => {
    const again = [
      ...windows,
      { trainerId: "lee", joinedAt: d("2027-01-01"), leftAt: null },
    ];
    expect(centerCanSee(again, "lee", d("2026-12-01"))).toBe(false);
    expect(centerCanSee(again, "lee", d("2027-01-02"))).toBe(true);
  });
});

describe("따라간 수강생의 연락처는 가린다", () => {
  it("지금 담당이 센터 소속일 때만 보인다", () => {
    expect(centerCanSeeContact(windows, "kim")).toBe(true);
    expect(centerCanSeeContact(windows, "lee")).toBe(false);
    expect(centerCanSeeContact(windows, null)).toBe(false);
  });
});

describe("본인 관련 승인 불가", () => {
  const members = ["kim", "lee", "admin-trainer"];
  it("같은 센터 안의 다른 관리자는 승인 가능", () => {
    expect(
      canCenterApprovePassTransfer({
        adminUserId: "boss",
        fromTrainerId: "kim",
        toTrainerId: "lee",
        members,
      }),
    ).toEqual({ ok: true });
  });
  it("관리자가 이전 트레이너면 불가", () => {
    expect(
      canCenterApprovePassTransfer({
        adminUserId: "admin-trainer",
        fromTrainerId: "admin-trainer",
        toTrainerId: "kim",
        members,
      }),
    ).toEqual({
      ok: false,
      reason: "SELF_INVOLVED",
    });
  });
  it("관리자가 새 트레이너면 불가", () => {
    expect(
      canCenterApprovePassTransfer({
        adminUserId: "admin-trainer",
        fromTrainerId: "kim",
        toTrainerId: "admin-trainer",
        members,
      }),
    ).toEqual({
      ok: false,
      reason: "SELF_INVOLVED",
    });
  });
  it("다른 센터로 가는 인계는 불가", () => {
    expect(
      canCenterApprovePassTransfer({
        adminUserId: "boss",
        fromTrainerId: "kim",
        toTrainerId: "outsider",
        members,
      }),
    ).toEqual({
      ok: false,
      reason: "NOT_SAME_CENTER",
    });
  });
});

describe("이동·탈퇴 선택", () => {
  it("선택지: 따라가기는 이동 때만, 개인 트레이너 탈퇴는 직접 찾기만", () => {
    expect(departureOptions("MOVE", true)).toEqual(["FOLLOW", "STAY"]);
    expect(departureOptions("WITHDRAW", true)).toEqual([
      "CENTER_ASSIGN",
      "FIND_OWN",
    ]);
    expect(departureOptions("WITHDRAW", false)).toEqual(["FIND_OWN"]);
  });
  it("무응답 기본값과 기한", () => {
    expect(departureDefault("MOVE", true)).toBe("FOLLOW");
    expect(departureDefault("WITHDRAW", true)).toBe("CENTER_ASSIGN");
    expect(departureDefault("WITHDRAW", false)).toBe("FIND_OWN");
    const now = d("2026-11-13");
    expect(departureDeadline("MOVE", now)).toEqual(d("2026-11-20"));
    expect(departureDeadline("WITHDRAW", now)).toEqual(d("2026-11-18"));
  });
});

describe("날짜만 있는 기록 (결제일)", () => {
  it("소속한 날 포함, 떠난 날부터 제외", async () => {
    const { centerCanSeeDate } = await import("./scope");
    const key = (x: Date) =>
      new Date(x.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    const w = [
      {
        trainerId: "lee",
        joinedAt: new Date("2026-03-01T10:00:00+09:00"),
        leftAt: new Date("2026-11-01T10:00:00+09:00"),
      },
    ];
    expect(centerCanSeeDate(w, "lee", "2026-03-01", key)).toBe(true);
    expect(centerCanSeeDate(w, "lee", "2026-02-28", key)).toBe(false);
    expect(centerCanSeeDate(w, "lee", "2026-10-31", key)).toBe(true);
    expect(centerCanSeeDate(w, "lee", "2026-11-01", key)).toBe(false);
  });
});
