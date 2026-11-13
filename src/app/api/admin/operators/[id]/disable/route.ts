import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { route } from "@/server/http";
import { requireApiOperator } from "@/server/admin/http";
import { disableOperator } from "@/server/admin/operator-service";

export const POST = route<RouteContext<"/api/admin/operators/[id]/disable">>(
  async (_request, ctx) => {
    const op = await requireApiOperator();
    const { id } = await ctx.params;
    await disableOperator(getDb(), op.operatorId, id);
    return NextResponse.json({ ok: true });
  },
);
