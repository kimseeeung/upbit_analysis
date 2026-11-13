import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readJson, route } from "@/server/http";
import {
  actLinkRequestLink,
  viewLinkRequestLink,
} from "@/server/notify/link-actions";

type Ctx = RouteContext<"/api/l/link/[token]">;

export const GET = route<Ctx>(async (_req, ctx) =>
  NextResponse.json(
    await viewLinkRequestLink(getDb(), (await ctx.params).token),
  ),
);

export const POST = route<Ctx>(async (request, ctx) => {
  const b = await readJson<{ accept?: unknown }>(request);
  await actLinkRequestLink(
    getDb(),
    (await ctx.params).token,
    b.accept === true,
  );
  return NextResponse.json({ ok: true });
});
