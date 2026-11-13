import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readJson, route } from "@/server/http";
import { requireApiOperator } from "@/server/admin/http";
import { answerInquiry } from "@/server/admin/notice-service";

export const POST = route<RouteContext<"/api/admin/inquiries/[id]">>(
  async (request, ctx) => {
    const op = await requireApiOperator();
    const { id } = await ctx.params;
    const b = await readJson<{ answer?: string }>(request);
    await answerInquiry(getDb(), op.operatorId, id, String(b.answer ?? ""));
    return NextResponse.json({ ok: true });
  },
);
