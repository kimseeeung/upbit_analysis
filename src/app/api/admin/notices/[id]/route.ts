import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { route } from "@/server/http";
import { requireApiOperator } from "@/server/admin/http";
import { deleteNotice } from "@/server/admin/notice-service";

export const DELETE = route<RouteContext<"/api/admin/notices/[id]">>(
  async (_request, ctx) => {
    const op = await requireApiOperator();
    const { id } = await ctx.params;
    await deleteNotice(getDb(), op.operatorId, id);
    return NextResponse.json({ ok: true });
  },
);
