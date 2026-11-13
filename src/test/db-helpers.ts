import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { SmsSender } from "@/server/sms/sender";
import { setSmsSenderForTest } from "@/server/sms/sender";

let client: PrismaClient | null = null;

export function testDb(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL_TEST!,
      }),
    });
  }
  return client;
}

/** _prisma_migrations만 남기고 모든 테이블을 비운다 */
export async function resetDb(db = testDb()) {
  const rows = await db.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (rows.length === 0) return;
  await db.$executeRawUnsafe(
    `TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

export const TERMS_EFFECTIVE = new Date("2026-01-01T00:00:00Z");

export async function seedTerms(
  db = testDb(),
  version = "v1",
  effectiveAt = TERMS_EFFECTIVE,
) {
  const terms = [
    { kind: "SERVICE", title: "서비스 이용약관", required: true },
    { kind: "PRIVACY", title: "개인정보 수집·이용", required: true },
    { kind: "THIRD_PARTY", title: "개인정보 제3자 제공", required: true },
    { kind: "NOTIFY", title: "수업 알림 수신", required: true },
    { kind: "MARKETING", title: "마케팅 정보 수신", required: false },
  ] as const;
  for (const t of terms) {
    await db.termsVersion.create({
      data: { ...t, version, body: `${t.title} 본문`, effectiveAt },
    });
  }
}

export const ALL_CONSENTS = {
  SERVICE: true,
  PRIVACY: true,
  THIRD_PARTY: true,
  NOTIFY: true,
  MARKETING: false,
};

/** 발송한 SMS를 모아 두는 테스트용 어댑터 */
export function captureSms() {
  const sent: { to: string; text: string }[] = [];
  const sender: SmsSender = {
    name: "test",
    async send(to, text) {
      sent.push({ to, text });
    },
  };
  setSmsSenderForTest(sender);
  return {
    sent,
    lastCode(): string {
      const m = /\[(\d{6})\]/.exec(sent.at(-1)?.text ?? "");
      if (!m) throw new Error("보낸 인증번호가 없습니다");
      return m[1];
    },
  };
}
