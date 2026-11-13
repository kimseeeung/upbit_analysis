import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readJson, route } from "@/server/http";
import { actApproveLink, viewApproveLink } from "@/server/notify/link-actions";

type Ctx = RouteContext<"/api/l/approve/[token]">;

export const GET = route<Ctx>(async (_req, ctx) =>
  NextResponse.json(await viewApproveLink(getDb(), (await ctx.params).token)),
);

export const POST = route<Ctx>(async (request, ctx) => {
  const b = await readJson<{
    action?: unknown;
    pin?: unknown;
    reason?: unknown;
  }>(request);
  await actApproveLink(
    getDb(),
    (await ctx.params).token,
    b.action === "REJECT"
      ? { action: "REJECT", reason: String(b.reason ?? "") }
      : { action: "APPROVE", pin: String(b.pin ?? "") },
  );
  return NextResponse.json({ ok: true });
});
