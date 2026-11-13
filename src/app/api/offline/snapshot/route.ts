import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireApiSession, route } from "@/server/http";
import { buildSnapshot } from "@/server/offline/offline-service";

/**
 * 휴대폰 백업 (11.1). 자동 로그인 기기에서만 (자동 로그인이어야 오프라인으로 열 수 있음, 11.2).
 */
export const GET = route(async () => {
  const s = await requireApiSession();
  if (!s.persistent)
    return NextResponse.json({
      enabled: false,
      reason: "자동 로그인 기기에서만 백업합니다",
    });
  const snapshot = await buildSnapshot(getDb(), {
    userId: s.principal.userId,
    role: s.principal.role,
  });
  if (!snapshot)
    return NextResponse.json({
      enabled: false,
      reason: "센터 관리자 화면은 오프라인 백업을 지원하지 않습니다",
    });
  return NextResponse.json({
    enabled: true,
    userId: s.principal.userId,
    snapshot,
  });
});
