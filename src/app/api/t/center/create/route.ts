import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createCenterForTrainer } from "@/server/center/center-service";
import { readJson, requireApiSession, route } from "@/server/http";
import { asOptionalString, asString } from "@/server/validate";

export const POST = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const b = await readJson<Record<string, unknown>>(request);
  const c = await createCenterForTrainer(getDb(), s.principal.userId, {
    name: asString(b.name, "센터명"),
    address: asString(b.address, "주소"),
    phone: asString(b.phone, "대표 전화"),
    bizNo: asOptionalString(b.bizNo),
  });
  return NextResponse.json({ centerId: c.id });
});
