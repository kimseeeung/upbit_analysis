import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { startDissolve } from "@/server/center/center-service";
import { readJson, requireApiSession, route } from "@/server/http";

export const POST = route(async (request) => {
  const s = await requireApiSession(["CENTER_ADMIN", "TRAINER"]);
  const b = await readJson<{ confirm?: unknown }>(request);
  if (b.confirm !== "해산")
    return NextResponse.json(
      {
        error: {
          code: "CONFIRM",
          message: "확인 문구로 '해산'을 입력해 주세요",
        },
      },
      { status: 400 },
    );
  const r = await startDissolve(getDb(), s.principal.userId);
  return NextResponse.json({ dissolveAt: r.dissolveAt.toISOString() });
});
