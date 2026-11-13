import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readJson, route } from "@/server/http";
import { actRulesLink, viewRulesLink } from "@/server/notify/link-actions";

type Ctx = RouteContext<"/api/l/rules/[token]">;

export const GET = route<Ctx>(async (_req, ctx) =>
  NextResponse.json(await viewRulesLink(getDb(), (await ctx.params).token)),
);

export const POST = route<Ctx>(async (request, ctx) => {
  const b = await readJson<{ action?: unknown; inquiryText?: unknown }>(
    request,
  );
  await actRulesLink(getDb(), (await ctx.params).token, {
    action: b.action === "INQUIRE" ? "INQUIRE" : "AGREE",
    inquiryText: typeof b.inquiryText === "string" ? b.inquiryText : undefined,
  });
  return NextResponse.json({ ok: true });
});
