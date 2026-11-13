import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { asReason } from "@/server/booking-input";
import { readJson, route } from "@/server/http";
import { actConfirmLink, viewConfirmLink } from "@/server/notify/link-actions";

type Ctx = RouteContext<"/api/l/confirm/[token]">;

export const GET = route<Ctx>(async (_req, ctx) =>
  NextResponse.json(await viewConfirmLink(getDb(), (await ctx.params).token)),
);

export const POST = route<Ctx>(async (request, ctx) => {
  const b = await readJson<{ accept?: unknown; reason?: unknown }>(request);
  await actConfirmLink(getDb(), (await ctx.params).token, {
    accept: b.accept === true,
    reason: asReason(b.reason),
  });
  return NextResponse.json({ ok: true });
});
