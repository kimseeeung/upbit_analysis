import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readJson, requireApiSession, route } from "@/server/http";
import {
  syncOfflineOps,
  type QueuedOp,
} from "@/server/offline/offline-service";

/** 복구 후 동기화: 임시 변경을 만든 순서대로 반영 (11.3) */
export const POST = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const b = await readJson<{ ops?: QueuedOp[] }>(request);
  const results = await syncOfflineOps(
    getDb(),
    s.principal.userId,
    Array.isArray(b.ops) ? b.ops : [],
  );
  return NextResponse.json({ results });
});
