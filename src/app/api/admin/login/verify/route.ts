import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { readJson, route } from "@/server/http";
import { assertAdminIp, requestIp, setAdminCookie } from "@/server/admin/http";
import { operatorLoginVerify } from "@/server/admin/operator-auth";

/** 2단계: 휴대폰 인증번호 → 관리자 세션 */
export const POST = route(async (request) => {
  await assertAdminIp();
  const b = await readJson<{ challengeToken?: string; code?: string }>(request);
  const r = await operatorLoginVerify(getDb(), {
    challengeToken: String(b.challengeToken ?? ""),
    code: String(b.code ?? ""),
    ip: await requestIp(),
  });
  const res = NextResponse.json({ ok: true, next: "/admin/versions" });
  setAdminCookie(res, r.token);
  return res;
});
