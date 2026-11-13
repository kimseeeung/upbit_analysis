import { describe, expect, it } from "vitest";
import {
  ForbiddenError,
  UnauthorizedError,
  areaForPath,
  assertAreaAccess,
  canAccessArea,
  homePathFor,
  type Principal,
} from "./access";

const trainer: Principal = {
  kind: "user",
  userId: "t1",
  role: "TRAINER",
  hasCenterAdmin: false,
};
const trainerWithCenter: Principal = { ...trainer, hasCenterAdmin: true };
const student: Principal = {
  kind: "user",
  userId: "s1",
  role: "STUDENT",
  hasCenterAdmin: false,
};
const centerAdmin: Principal = {
  kind: "user",
  userId: "c1",
  role: "CENTER_ADMIN",
  hasCenterAdmin: false,
};
const operator: Principal = { kind: "operator", operatorId: "op1" };

describe("경로 영역", () => {
  it.each([
    ["/", "public"],
    ["/login", "public"],
    ["/signup", "public"],
    ["/students", "public"], // /s로 시작하지만 /s 영역이 아님
    ["/t", "trainer"],
    ["/t/students/abc", "trainer"],
    ["/s", "student"],
    ["/s/requests", "student"],
    ["/c/settings", "center"],
    ["/l/confirm/tok", "link"],
    ["/admin", "admin"],
    ["/admin/versions", "admin"],
    ["/admin/login", "adminLogin"],
    ["/admin/invite/abc", "adminLogin"],
  ])("%s → %s", (path, area) => {
    expect(areaForPath(path)).toBe(area);
  });
});

describe("영역 권한", () => {
  it("공개 영역과 카톡 링크는 누구나", () => {
    for (const p of [null, trainer, student, operator]) {
      expect(canAccessArea(p, "public")).toBe(true);
      expect(canAccessArea(p, "link")).toBe(true);
      expect(canAccessArea(p, "adminLogin")).toBe(true);
    }
  });

  it("로그인하지 않으면 보호 영역 불가", () => {
    for (const a of ["trainer", "student", "center", "admin"] as const) {
      expect(canAccessArea(null, a)).toBe(false);
    }
  });

  it("역할별 영역", () => {
    expect(canAccessArea(trainer, "trainer")).toBe(true);
    expect(canAccessArea(trainer, "student")).toBe(false);
    expect(canAccessArea(trainer, "center")).toBe(false);
    expect(canAccessArea(trainer, "admin")).toBe(false);

    expect(canAccessArea(student, "student")).toBe(true);
    expect(canAccessArea(student, "trainer")).toBe(false);
    expect(canAccessArea(student, "center")).toBe(false);

    expect(canAccessArea(centerAdmin, "center")).toBe(true);
    expect(canAccessArea(centerAdmin, "trainer")).toBe(false);
    expect(canAccessArea(centerAdmin, "admin")).toBe(false);
  });

  it("트레이너 + 센터 권한은 /t와 /c 모두", () => {
    expect(canAccessArea(trainerWithCenter, "trainer")).toBe(true);
    expect(canAccessArea(trainerWithCenter, "center")).toBe(true);
    expect(canAccessArea(trainerWithCenter, "admin")).toBe(false);
  });

  it("운영 관리자는 /admin만", () => {
    expect(canAccessArea(operator, "admin")).toBe(true);
    expect(canAccessArea(operator, "trainer")).toBe(false);
    expect(canAccessArea(operator, "center")).toBe(false);
  });

  it("검사 실패는 401/403 오류", () => {
    expect(() => assertAreaAccess(null, "trainer")).toThrow(UnauthorizedError);
    expect(() => assertAreaAccess(student, "trainer")).toThrow(ForbiddenError);
    expect(assertAreaAccess(trainer, "trainer")).toBe(trainer);
    expect(assertAreaAccess(null, "public")).toBeNull();
  });

  it("홈 경로", () => {
    expect(homePathFor(trainer)).toBe("/t");
    expect(homePathFor(student)).toBe("/s");
    expect(homePathFor(centerAdmin)).toBe("/c");
    expect(homePathFor(operator)).toBe("/admin/versions");
  });
});
