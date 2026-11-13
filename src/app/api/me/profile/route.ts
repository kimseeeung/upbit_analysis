import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { maskPhone } from "@/lib/phone";
import { toKstDateKey } from "@/lib/time";
import { updateProfile } from "@/server/auth/account-service";
import { getCurrentTerms } from "@/server/auth/terms-service";
import { readJson, requireApiSession, route } from "@/server/http";
import { asOptionalString, asString } from "@/server/validate";

export const GET = route(async () => {
  const s = await requireApiSession();
  const db = getDb();
  const u = await db.user.findUniqueOrThrow({
    where: { id: s.principal.userId },
    include: {
      trainerProfile: true,
      studentProfile: { select: { pinLockedUntil: true } },
      termsConsents: {
        orderBy: { agreedAt: "desc" },
        include: { termsVersion: true },
      },
    },
  });
  const marketing = (await getCurrentTerms(db)).find(
    (t) => t.kind === "MARKETING",
  );
  const marketingConsent = u.termsConsents.find(
    (c) => c.termsVersion.kind === "MARKETING",
  );
  return NextResponse.json({
    loginId: u.loginId,
    role: u.role,
    name: u.name,
    phoneMasked: maskPhone(u.phone),
    joinedAt: toKstDateKey(u.createdAt),
    workplaceText: u.trainerProfile?.workplaceText ?? null,
    workplaceAddress: u.trainerProfile?.workplaceAddress ?? null,
    pinLocked:
      !!u.studentProfile?.pinLockedUntil &&
      u.studentProfile.pinLockedUntil > new Date(),
    marketing: marketing ? { agreed: marketingConsent?.agreed ?? false } : null,
  });
});

export const PATCH = route(async (request) => {
  const s = await requireApiSession();
  const b = await readJson<Record<string, unknown>>(request);
  await updateProfile(getDb(), {
    userId: s.principal.userId,
    name: asString(b.name, "이름"),
    workplaceText:
      b.workplaceText === undefined
        ? undefined
        : asOptionalString(b.workplaceText),
    workplaceAddress: asOptionalString(b.workplaceAddress),
  });
  return NextResponse.json({ ok: true });
});
