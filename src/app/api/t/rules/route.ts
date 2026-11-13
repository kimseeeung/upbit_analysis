import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  describeRules,
  parseRuleValues,
  pickRuleValues,
} from "@/lib/rules/rule-set";
import { AppError } from "@/server/errors";
import {
  getTrainerDefaultRuleSet,
  updateTrainerDefaultRules,
} from "@/server/rules/rule-service";
import { readJson, requireApiSession, route } from "@/server/http";

export const GET = route(async () => {
  const s = await requireApiSession(["TRAINER"]);
  const r = await getTrainerDefaultRuleSet(getDb(), s.principal.userId);
  return NextResponse.json({
    version: r.version,
    rules: pickRuleValues(r),
    text: describeRules(pickRuleValues(r)),
  });
});

export const PUT = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const parsed = parseRuleValues(
    await readJson<Record<string, unknown>>(request),
  );
  if (!parsed.ok) throw new AppError("INVALID", parsed.message);
  const r = await updateTrainerDefaultRules(
    getDb(),
    s.principal.userId,
    parsed.value,
  );
  return NextResponse.json({ version: r.version, rules: pickRuleValues(r) });
});
