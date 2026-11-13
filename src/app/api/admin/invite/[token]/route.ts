import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readJson, route } from "@/server/http";
import { assertAdminIp } from "@/server/admin/http";
import { acceptInvite, getInvite } from "@/server/admin/operator-service";

type Ctx = RouteContext<"/api/admin/invite/[token]">;

export const GET = route<Ctx>(async (_request, ctx) => {
  await assertAdminIp();
  const { token } = await ctx.params;
  return NextResponse.json(await getInvite(getDb(), token));
});

export const POST = route<Ctx>(async (request, ctx) => {
  await assertAdminIp();
  const { token } = await ctx.params;
  const b = await readJson<Record<string, unknown>>(request);
  await acceptInvite(getDb(), token, {
    loginId: String(b.loginId ?? ""),
    password: String(b.password ?? ""),
    rollbackPin: String(b.rollbackPin ?? ""),
    verificationId: String(b.verificationId ?? ""),
  });
  return NextResponse.json({ ok: true, next: "/admin/login" });
});
