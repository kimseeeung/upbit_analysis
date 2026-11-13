import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { respondMembership } from "@/server/center/center-service";
import { readJson, requireApiSession, route } from "@/server/http";

export const POST = route<
  RouteContext<"/api/c/memberships/[membershipId]/respond">
>(async (request, ctx) => {
  const s = await requireApiSession(["CENTER_ADMIN", "TRAINER"]);
  const { membershipId } = await ctx.params;
  const b = await readJson<{ approve?: unknown }>(request);
  await respondMembership(
    getDb(),
    s.principal.userId,
    membershipId,
    b.approve === true,
  );
  return NextResponse.json({ ok: true });
});
