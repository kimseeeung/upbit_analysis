import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { changePhone } from "@/server/auth/account-service";
import { readJson, requireApiSession, route } from "@/server/http";
import { asString } from "@/server/validate";

export const POST = route(async (request) => {
  const s = await requireApiSession();
  const b = await readJson<Record<string, unknown>>(request);
  await changePhone(getDb(), {
    userId: s.principal.userId,
    phone: asString(b.phone, "전화번호"),
    verificationId: asString(b.verificationId),
  });
  return NextResponse.json({ ok: true });
});
