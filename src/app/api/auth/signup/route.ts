import { NextResponse } from "next/server";
import { deviceLabelFromUserAgent } from "@/lib/auth/session-rules";
import { getDb } from "@/lib/db";
import { createSession } from "@/server/auth/session-service";
import { signup, type SignupInput } from "@/server/auth/signup-service";
import { readJson, route, setSessionCookies } from "@/server/http";
import { asRole } from "@/server/validate";

export const POST = route(async (request) => {
  const body = await readJson<SignupInput>(request);
  const db = getDb();
  const role = asRole(body.role);
  const { userId } = await signup(db, { ...body, role });
  // 가입 직후 바로 안내 화면으로 이어지도록 로그인 상태로 만든다(자동 로그인 아님)
  const session = await createSession(db, {
    userId,
    persistent: false,
    deviceLabel: deviceLabelFromUserAgent(request.headers.get("user-agent")),
  });
  const res = NextResponse.json({
    ok: true,
    next:
      role === "TRAINER"
        ? "/onboarding/notifications?then=availability"
        : "/onboarding/notifications",
  });
  setSessionCookies(res, session.token, false);
  return res;
});
