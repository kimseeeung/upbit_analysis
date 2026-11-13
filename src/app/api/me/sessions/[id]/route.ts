import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { revokeSession } from "@/server/auth/session-service";
import { AppError } from "@/server/errors";
import { clearSessionCookies, requireApiSession, route } from "@/server/http";

export const DELETE = route<RouteContext<"/api/me/sessions/[id]">>(
  async (_req, ctx) => {
    const s = await requireApiSession();
    const { id } = await ctx.params;
    const ok = await revokeSession(getDb(), s.principal.userId, id);
    if (!ok) throw new AppError("NOT_FOUND", "기기를 찾을 수 없습니다", 404);
    const res = NextResponse.json({ ok: true, loggedOut: id === s.sessionId });
    if (id === s.sessionId) clearSessionCookies(res);
    return res;
  },
);
