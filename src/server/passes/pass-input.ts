import { parseRuleValues } from "@/lib/rules/rule-set";
import { AppError } from "@/server/errors";
import type { PassInput } from "./pass-service";

const num = (v: unknown) =>
  typeof v === "number"
    ? v
    : typeof v === "string" && v.trim()
      ? Number(v)
      : NaN;
const optNum = (v: unknown) =>
  v === null || v === undefined || v === "" ? null : num(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const optStr = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/** 요청 본문 → 이용권 입력 */
export function parsePassInput(b: Record<string, unknown>): PassInput {
  let rules = null;
  if (b.rules && typeof b.rules === "object") {
    const r = parseRuleValues(b.rules as Record<string, unknown>);
    if (!r.ok) throw new AppError("INVALID", r.message);
    rules = r.value;
  }
  return {
    name: str(b.name),
    count: num(b.count),
    bonusCount: optNum(b.bonusCount) ?? 0,
    startDate: str(b.startDate),
    endDate: str(b.endDate),
    sessionMinutes: optNum(b.sessionMinutes) ?? 50,
    price: optNum(b.price),
    paidAt: optStr(b.paidAt),
    payMethod: optStr(b.payMethod),
    memo: optStr(b.memo),
    rules,
  };
}
