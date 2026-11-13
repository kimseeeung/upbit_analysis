import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseRuleValues } from "@/lib/rules/rule-set";
import {
  getCenterDefaultRules,
  requireCenterAdmin,
  updateCenterDefaultRules,
} from "@/server/center/center-service";
import { AppError } from "@/server/errors";
import { readJson, requireApiSession, route } from "@/server/http";

export const GET = route(async () => {
  const s = await requireApiSession(["CENTER_ADMIN", "TRAINER"]);
  const db = getDb();
  const { center } = await requireCenterAdmin(db, s.principal.userId);
  return NextResponse.json(await getCenterDefaultRules(db, center.id));
});

export const PUT = route(async (request) => {
  const s = await requireApiSession(["CENTER_ADMIN", "TRAINER"]);
  const parsed = parseRuleValues(
    await readJson<Record<string, unknown>>(request),
  );
  if (!parsed.ok) throw new AppError("INVALID", parsed.message);
  return NextResponse.json(
    await updateCenterDefaultRules(getDb(), s.principal.userId, parsed.value),
  );
});
