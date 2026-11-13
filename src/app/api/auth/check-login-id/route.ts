import { NextResponse } from "next/server";
import { validateLoginId } from "@/lib/auth/policy";
import { getDb } from "@/lib/db";
import { isLoginIdAvailable } from "@/server/auth/signup-service";
import { route } from "@/server/http";

export const GET = route(async (request) => {
  const loginId = new URL(request.url).searchParams.get("loginId") ?? "";
  const policy = validateLoginId(loginId);
  if (!policy.ok)
    return NextResponse.json({ available: false, message: policy.message });
  const available = await isLoginIdAvailable(getDb(), loginId);
  return NextResponse.json({
    available,
    message: available
      ? "사용할 수 있는 아이디입니다"
      : "이미 사용 중인 아이디입니다",
  });
});
