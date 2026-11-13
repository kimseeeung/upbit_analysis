/**
 * 권한 판단(순수 함수). 화면 접근은 proxy에서 쿠키 유무만 빠르게 보고,
 * 실제 권한은 서버(페이지·Server Function·Route Handler)에서 매 요청마다
 * 이 함수들로 다시 검사한다.
 */

export type UserRole = "TRAINER" | "STUDENT" | "CENTER_ADMIN";

/** 로그인한 주체. 운영 관리자는 회원과 계정 체계가 다르다. */
export type Principal =
  | {
      kind: "user";
      userId: string;
      role: UserRole;
      /** 트레이너 + 센터 권한 */
      hasCenterAdmin: boolean;
    }
  | { kind: "operator"; operatorId: string };

/** 경로 영역 (docs/03_화면목록.md) */
export type Area =
  | "public" // /, /login, /signup ...
  | "link" // /l/* 카톡 1회용 링크 (로그인 없이 토큰으로)
  | "trainer" // /t
  | "student" // /s
  | "center" // /c
  | "admin" // /admin (로그인 화면 제외)
  | "adminLogin"; // /admin/login

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function areaForPath(pathname: string): Area {
  if (underPrefix(pathname, "/admin/login")) return "adminLogin";
  if (underPrefix(pathname, "/admin")) return "admin";
  if (underPrefix(pathname, "/t")) return "trainer";
  if (underPrefix(pathname, "/s")) return "student";
  if (underPrefix(pathname, "/c")) return "center";
  if (underPrefix(pathname, "/l")) return "link";
  return "public";
}

/** 로그인이 필요한 영역인가 */
export function isProtectedArea(area: Area): boolean {
  return (
    area === "trainer" ||
    area === "student" ||
    area === "center" ||
    area === "admin"
  );
}

/** 주체가 영역에 들어갈 수 있는가 */
export function canAccessArea(
  principal: Principal | null,
  area: Area,
): boolean {
  if (!isProtectedArea(area)) return true;
  if (!principal) return false;

  if (principal.kind === "operator") return area === "admin";

  switch (area) {
    case "trainer":
      return principal.role === "TRAINER";
    case "student":
      return principal.role === "STUDENT";
    case "center":
      return (
        principal.role === "CENTER_ADMIN" ||
        (principal.role === "TRAINER" && principal.hasCenterAdmin)
      );
    case "admin":
      return false;
    default:
      return false;
  }
}

/** 로그인 후 처음 보낼 홈 경로 */
export function homePathFor(principal: Principal): string {
  if (principal.kind === "operator") return "/admin/versions";
  switch (principal.role) {
    case "TRAINER":
      return "/t";
    case "STUDENT":
      return "/s";
    case "CENTER_ADMIN":
      return "/c";
  }
}

/** 권한 없음. Route Handler에서는 403으로 바꿔 응답한다. */
export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "권한이 없습니다") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** 로그인 필요. Route Handler에서는 401로 바꿔 응답한다. */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "로그인이 필요합니다") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** 영역 권한을 검사하고 통과한 주체를 돌려준다. */
export function assertAreaAccess(
  principal: Principal | null,
  area: Area,
): Principal | null {
  if (!isProtectedArea(area)) return principal;
  if (!principal) throw new UnauthorizedError();
  if (!canAccessArea(principal, area)) throw new ForbiddenError();
  return principal;
}
