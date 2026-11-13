import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readJson, route } from "@/server/http";
import { requireApiOperator } from "@/server/admin/http";
import {
  inviteOperator,
  listAlerts,
  listOperators,
} from "@/server/admin/operator-service";

export const GET = route(async () => {
  const op = await requireApiOperator();
  const db = getDb();
  return NextResponse.json({
    me: op.operatorId,
    operators: await listOperators(db),
    alerts: await listAlerts(db, op.operatorId),
  });
});

/** 이름·휴대폰 번호로 초대. 링크는 이 응답에서 한 번만 보여 준다 */
export const POST = route(async (request) => {
  const op = await requireApiOperator();
  const b = await readJson<{ name?: string; phone?: string }>(request);
  const r = await inviteOperator(getDb(), op.operatorId, {
    name: String(b.name ?? ""),
    phone: String(b.phone ?? ""),
  });
  const base = process.env.APP_BASE_URL ?? new URL(request.url).origin;
  return NextResponse.json({
    inviteUrl: new URL(`/admin/invite/${r.token}`, base).toString(),
  });
});
