import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readJson, route } from "@/server/http";
import { assertAdminIp } from "@/server/admin/http";
import { operatorLoginStart } from "@/server/admin/operator-auth";

/** 1단계: 아이디·비밀번호 → 등록 휴대폰으로 인증번호 */
export const POST = route(async (request) => {
  await assertAdminIp();
  const b = await readJson<{ loginId?: string; password?: string }>(request);
  const r = await operatorLoginStart(getDb(), {
    loginId: String(b.loginId ?? ""),
    password: String(b.password ?? ""),
  });
  return NextResponse.json(r);
});
