import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listActiveSessions } from "@/server/auth/session-service";
import { requireApiSession, route } from "@/server/http";

export const GET = route(async () => {
  const s = await requireApiSession();
  const rows = await listActiveSessions(getDb(), s.principal.userId);
  return NextResponse.json({
    sessions: rows.map((r) => ({
      id: r.id,
      deviceLabel: r.deviceLabel,
      lastSeenAt: r.lastSeenAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      persistent: r.persistent,
      current: r.id === s.sessionId,
    })),
  });
});
