import { AppError } from "@/server/errors";

export function asDate(v: unknown, label = "시각"): Date {
  const d = typeof v === "string" ? new Date(v) : new Date(NaN);
  if (Number.isNaN(d.getTime()))
    throw new AppError("INVALID", `${label}을(를) 확인해 주세요`);
  return d;
}

export function asSlots(v: unknown): { start: Date; end: Date }[] {
  if (!Array.isArray(v)) throw new AppError("INVALID", "시간을 골라 주세요");
  return v.map((s) => ({ start: asDate(s?.startAt), end: asDate(s?.endAt) }));
}

export function asReason(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : undefined;
}
