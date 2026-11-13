import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { findLoginId } from "@/server/auth/account-service";
import { readJson, route } from "@/server/http";
import { asRole, asString } from "@/server/validate";

export const POST = route(async (request) => {
  const b = await readJson<Record<string, unknown>>(request);
  const r = await findLoginId(getDb(), {
    role: asRole(b.role),
    name: asString(b.name, "이름"),
    phone: asString(b.phone, "전화번호"),
    verificationId: asString(b.verificationId),
  });
  return NextResponse.json({
    maskedLoginId: r.maskedLoginId,
    joinedAt: r.joinedAt.toISOString(),
  });
});
