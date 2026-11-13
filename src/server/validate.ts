import { AppError } from "@/server/errors";

const ROLES = ["TRAINER", "STUDENT", "CENTER_ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export function asRole(v: unknown): Role {
  if (typeof v === "string" && (ROLES as readonly string[]).includes(v))
    return v as Role;
  throw new AppError("INVALID", "회원 유형을 선택해 주세요");
}

export function asString(v: unknown, field = "값"): string {
  if (typeof v !== "string")
    throw new AppError("INVALID", `${field}을(를) 입력해 주세요`);
  return v;
}

export function asOptionalString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

const PURPOSES = [
  "SIGNUP",
  "FIND_ID",
  "RESET_PW",
  "RESET_PIN",
  "CHANGE_PHONE",
  "WITHDRAW",
] as const;
export type PublicSmsPurpose = (typeof PURPOSES)[number];

export function asSmsPurpose(v: unknown): PublicSmsPurpose {
  if (typeof v === "string" && (PURPOSES as readonly string[]).includes(v)) {
    return v as PublicSmsPurpose;
  }
  throw new AppError("INVALID", "잘못된 요청입니다");
}
