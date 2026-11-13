/**
 * 감사 로그(AuditLog) 헬퍼.
 *
 * 예약·승인·차감·이용권·권한 변경은 모두 이 헬퍼로 기록한다.
 * before/after에 비밀번호·PIN·토큰 같은 비밀값이 섞여 들어와도
 * 저장 전에 가려서, 평문이든 해시든 로그에 남지 않게 한다.
 */

import type { Prisma } from "@/generated/prisma/client";

export type AuditActor =
  | { type: "USER"; id: string }
  | { type: "OPERATOR"; id: string }
  | { type: "SYSTEM" };

export interface AuditInput {
  actor: AuditActor;
  /** 대상 엔티티 이름. 예: "Booking", "Pass" */
  entity: string;
  entityId: string;
  /** 동작. 예: "booking.confirm", "pass.update" */
  action: string;
  before?: unknown;
  after?: unknown;
  /** 기본값: 지금 */
  at?: Date;
}

export const REDACTED = "[REDACTED]";

/**
 * 필드 이름을 단어로 나눴을 때 이 단어가 하나라도 있으면 값을 가린다.
 * 예: passwordHash, pinSalt, tokenHash, rollback_pin, codeHash
 * (단어 단위로 보므로 "opinion", "shipping" 같은 이름은 가리지 않는다)
 */
const SENSITIVE_WORDS = new Set([
  "password",
  "passwd",
  "pin",
  "salt",
  "secret",
  "token",
  "hash",
  "otp",
  "p256dh",
  "auth",
  "apikey",
  "credential",
]);

function splitKeyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

export function isSensitiveKey(key: string): boolean {
  const words = splitKeyWords(key);
  if (words.some((w) => SENSITIVE_WORDS.has(w))) return true;
  const joined = words.join("");
  // apiKey, api_key, smsApiKey, 인증번호 code
  return joined.includes("apikey") || joined === "code";
}

/** 비밀값 필드를 가린 JSON 호환 값으로 바꾼다. */
export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 20) return REDACTED;
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1));
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[key] = isSensitiveKey(key) ? REDACTED : redactSensitive(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  return value;
}

export interface AuditRecord {
  actorType: AuditActor["type"];
  actorId: string | null;
  entity: string;
  entityId: string;
  action: string;
  before: Prisma.InputJsonValue | null;
  after: Prisma.InputJsonValue | null;
  at: Date;
}

/** 입력을 검사하고 저장할 레코드로 만든다(순수 함수). */
export function buildAuditRecord(input: AuditInput): AuditRecord {
  const { actor } = input;
  if (actor.type !== "SYSTEM" && !actor.id) {
    throw new Error("감사 로그: USER·OPERATOR 기록에는 actor id가 필요합니다");
  }
  for (const [name, v] of [
    ["entity", input.entity],
    ["entityId", input.entityId],
    ["action", input.action],
  ] as const) {
    if (!v || !v.trim()) {
      throw new Error(`감사 로그: ${name}가 비어 있습니다`);
    }
  }
  return {
    actorType: actor.type,
    actorId: actor.type === "SYSTEM" ? null : actor.id,
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    before: (redactSensitive(input.before) ??
      null) as Prisma.InputJsonValue | null,
    after: (redactSensitive(input.after) ??
      null) as Prisma.InputJsonValue | null,
    at: input.at ?? new Date(),
  };
}

/** auditLog.create만 있으면 되므로 트랜잭션 클라이언트도 그대로 넘길 수 있다. */
export interface AuditWriter {
  auditLog: {
    create(args: { data: Prisma.AuditLogCreateInput }): Promise<unknown>;
  };
}

/**
 * 감사 로그를 저장한다. 변경과 같은 트랜잭션에서 호출해
 * 변경과 기록이 함께 저장되거나 함께 취소되게 한다.
 */
export async function writeAuditLog(
  db: AuditWriter,
  input: AuditInput,
): Promise<void> {
  const record = buildAuditRecord(input);
  await db.auditLog.create({
    data: {
      ...record,
      before: record.before ?? undefined,
      after: record.after ?? undefined,
    },
  });
}
