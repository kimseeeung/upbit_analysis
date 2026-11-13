import type { TermsKind } from "@/generated/prisma/client";
import type { Db } from "@/server/db-types";
import { AppError } from "@/server/errors";

export const TERMS_ORDER: TermsKind[] = [
  "SERVICE",
  "PRIVACY",
  "THIRD_PARTY",
  "NOTIFY",
  "MARKETING",
];

export interface CurrentTerms {
  id: string;
  kind: TermsKind;
  version: string;
  title: string;
  required: boolean;
  body: string;
  effectiveAt: Date;
}

/** 종류별로 지금 시행 중인 최신 약관 */
export async function getCurrentTerms(
  db: Db,
  now = new Date(),
): Promise<CurrentTerms[]> {
  const rows = await db.termsVersion.findMany({
    where: { effectiveAt: { lte: now } },
    orderBy: { effectiveAt: "desc" },
  });
  const latest = new Map<TermsKind, CurrentTerms>();
  for (const r of rows) if (!latest.has(r.kind)) latest.set(r.kind, r);
  return TERMS_ORDER.flatMap((k) => (latest.has(k) ? [latest.get(k)!] : []));
}

export type ConsentInput = Partial<Record<TermsKind, boolean>>;

/** 동의 항목, 약관 버전, 동의 일시를 저장한다. 필수 미동의면 거부. */
export async function recordConsents(
  db: Db,
  userId: string,
  consents: ConsentInput,
  now = new Date(),
): Promise<void> {
  const terms = await getCurrentTerms(db, now);
  if (terms.length === 0) {
    throw new AppError("NO_TERMS", "약관이 준비되지 않았습니다", 500);
  }
  const missing = terms.filter((t) => t.required && consents[t.kind] !== true);
  if (missing.length > 0) {
    throw new AppError(
      "CONSENT_REQUIRED",
      `필수 약관에 동의해 주세요: ${missing.map((t) => t.title).join(", ")}`,
    );
  }
  await db.termsConsent.createMany({
    data: terms.map((t) => ({
      userId,
      termsVersionId: t.id,
      agreed: consents[t.kind] === true,
      agreedAt: now,
    })),
  });
}

/** 새 버전이 시행돼 다시 동의해야 하는 필수 약관 (명세 1.3) */
export async function getTermsNeedingReconsent(
  db: Db,
  userId: string,
  now = new Date(),
): Promise<CurrentTerms[]> {
  const terms = await getCurrentTerms(db, now);
  const required = terms.filter((t) => t.required);
  if (required.length === 0) return [];
  const agreed = await db.termsConsent.findMany({
    where: {
      userId,
      agreed: true,
      termsVersionId: { in: required.map((t) => t.id) },
    },
    select: { termsVersionId: true },
  });
  const agreedIds = new Set(agreed.map((a) => a.termsVersionId));
  return required.filter((t) => !agreedIds.has(t.id));
}

/** 선택 항목(마케팅) 동의를 바꾼다 (내 정보) */
export async function setOptionalConsent(
  db: Db,
  userId: string,
  kind: TermsKind,
  agreed: boolean,
  now = new Date(),
): Promise<void> {
  const t = (await getCurrentTerms(db, now)).find((x) => x.kind === kind);
  if (!t || t.required) {
    throw new AppError("INVALID", "바꿀 수 없는 항목입니다");
  }
  await db.termsConsent.create({
    data: { userId, termsVersionId: t.id, agreed, agreedAt: now },
  });
}

/** 재동의: 다시 동의해야 하는 필수 약관만 기록한다(선택 항목 동의는 그대로 둔다) */
export async function recordReconsents(
  db: Db,
  userId: string,
  consents: ConsentInput,
  now = new Date(),
): Promise<void> {
  const pending = await getTermsNeedingReconsent(db, userId, now);
  const missing = pending.filter((t) => consents[t.kind] !== true);
  if (missing.length > 0) {
    throw new AppError(
      "CONSENT_REQUIRED",
      `필수 약관에 동의해 주세요: ${missing.map((t) => t.title).join(", ")}`,
    );
  }
  if (pending.length === 0) return;
  await db.termsConsent.createMany({
    data: pending.map((t) => ({
      userId,
      termsVersionId: t.id,
      agreed: true,
      agreedAt: now,
    })),
  });
}
