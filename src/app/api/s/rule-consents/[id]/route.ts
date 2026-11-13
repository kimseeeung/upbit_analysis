import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { respondRuleConsent } from "@/server/rules/rule-service";
import { readJson, requireApiSession, route } from "@/server/http";
import { asOptionalString } from "@/server/validate";

export const POST = route<RouteContext<"/api/s/rule-consents/[id]">>(
  async (request, ctx) => {
    const s = await requireApiSession(["STUDENT"]);
    const { id } = await ctx.params;
    const b = await readJson<{ action?: unknown; inquiryText?: unknown }>(
      request,
    );
    await respondRuleConsent(getDb(), {
      studentUserId: s.principal.userId,
      consentId: id,
      action: b.action === "INQUIRE" ? "INQUIRE" : "AGREE",
      inquiryText: asOptionalString(b.inquiryText) ?? undefined,
    });
    return NextResponse.json({ ok: true });
  },
);
