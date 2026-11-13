import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readJson, route } from "@/server/http";
import { requireApiOperator } from "@/server/admin/http";
import {
  getMemberDetail,
  setMemberSuspended,
} from "@/server/admin/member-admin-service";

type Ctx = RouteContext<"/api/admin/users/[id]">;

/** 열어 볼 때마다 조회 기록 */
export const GET = route<Ctx>(async (_request, ctx) => {
  const op = await requireApiOperator();
  const { id } = await ctx.params;
  return NextResponse.json({
    user: await getMemberDetail(getDb(), op.operatorId, id),
  });
});

/** 정지·해제 */
export const POST = route<Ctx>(async (request, ctx) => {
  const op = await requireApiOperator();
  const { id } = await ctx.params;
  const b = await readJson<{ suspend?: boolean; reason?: string }>(request);
  await setMemberSuspended(getDb(), op.operatorId, id, {
    suspend: b.suspend === true,
    reason: typeof b.reason === "string" ? b.reason : undefined,
  });
  return NextResponse.json({ ok: true });
});
