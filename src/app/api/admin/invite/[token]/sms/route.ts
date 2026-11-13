import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { route } from "@/server/http";
import { assertAdminIp } from "@/server/admin/http";
import { sendInviteCode } from "@/server/admin/operator-service";

export const POST = route<RouteContext<"/api/admin/invite/[token]/sms">>(
  async (_request, ctx) => {
    await assertAdminIp();
    const { token } = await ctx.params;
    const r = await sendInviteCode(getDb(), token);
    return NextResponse.json(r);
  },
);
