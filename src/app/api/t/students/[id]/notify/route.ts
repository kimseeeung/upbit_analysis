import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { setStudentNotify } from "@/server/notify/settings";
import { readJson, requireApiSession, route } from "@/server/http";

export const PATCH = route<RouteContext<"/api/t/students/[id]/notify">>(
  async (request, ctx) => {
    const s = await requireApiSession(["TRAINER"]);
    const { id } = await ctx.params;
    const b = await readJson<{ notifyDayBefore?: boolean; notify2h?: boolean }>(
      request,
    );
    await setStudentNotify(getDb(), s.principal.userId, [id], b);
    return NextResponse.json({ ok: true });
  },
);
