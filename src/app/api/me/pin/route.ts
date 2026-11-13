import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { resetPin } from "@/server/auth/account-service";
import { readJson, requireApiSession, route } from "@/server/http";
import { asString } from "@/server/validate";

export const POST = route(async (request) => {
  const s = await requireApiSession(["STUDENT"]);
  const b = await readJson<Record<string, unknown>>(request);
  await resetPin(getDb(), {
    userId: s.principal.userId,
    verificationId: asString(b.verificationId),
    pin: asString(b.pin, "PIN"),
    pinConfirm: asString(b.pinConfirm, "PIN 확인"),
  });
  return NextResponse.json({ ok: true });
});
