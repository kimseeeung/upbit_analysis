import { NextResponse } from "next/server";
import { homePathFor } from "@/lib/auth/access";
import { getDb } from "@/lib/db";
import {
  getTermsNeedingReconsent,
  recordReconsents,
  setOptionalConsent,
} from "@/server/auth/terms-service";
import { readJson, requireApiSession, route } from "@/server/http";

/** 바뀐 약관 목록 */
export const GET = route(async () => {
  const s = await requireApiSession();
  const pending = await getTermsNeedingReconsent(getDb(), s.principal.userId);
  return NextResponse.json({
    terms: pending.map((t) => ({
      kind: t.kind,
      title: t.title,
      version: t.version,
      body: t.body,
    })),
  });
});

/** 약관 재동의 */
export const POST = route(async (request) => {
  const s = await requireApiSession();
  const b = await readJson<{ consents?: Record<string, boolean> }>(request);
  await recordReconsents(getDb(), s.principal.userId, b.consents ?? {});
  return NextResponse.json({ ok: true, next: homePathFor(s.principal) });
});

/** 선택 항목(마케팅 수신) 변경 */
export const PATCH = route(async (request) => {
  const s = await requireApiSession();
  const b = await readJson<{ marketing?: unknown }>(request);
  await setOptionalConsent(
    getDb(),
    s.principal.userId,
    "MARKETING",
    b.marketing === true,
  );
  return NextResponse.json({ ok: true });
});
