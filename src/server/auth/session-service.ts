import type { Principal } from "@/lib/auth/access";
import {
  hashSessionToken,
  isSessionActive,
  newSessionToken,
  sessionLifetimeMs,
  slideSession,
} from "@/lib/auth/session-rules";
import type { Db } from "@/server/db-types";

export interface CreatedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
  persistent: boolean;
}

export async function createSession(
  db: Db,
  input: { userId: string; persistent: boolean; deviceLabel: string },
  now = new Date(),
): Promise<CreatedSession> {
  const token = newSessionToken();
  const expiresAt = new Date(
    now.getTime() + sessionLifetimeMs(input.persistent),
  );
  const row = await db.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId: input.userId,
      persistent: input.persistent,
      deviceLabel: input.deviceLabel.slice(0, 100),
      lastSeenAt: now,
      expiresAt,
      createdAt: now,
    },
  });
  return { token, sessionId: row.id, expiresAt, persistent: input.persistent };
}

export interface ResolvedSession {
  principal: Extract<Principal, { kind: "user" }>;
  sessionId: string;
  persistent: boolean;
  userName: string;
  userStatus: "ACTIVE" | "WITHDRAWING" | "DELETED";
}

/** 쿠키의 토큰으로 세션을 찾고, 유효하면 슬라이딩 연장한다. */
export async function resolveSession(
  db: Db,
  token: string | undefined,
  now = new Date(),
): Promise<ResolvedSession | null> {
  if (!token) return null;
  const s = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          name: true,
          status: true,
          suspendedAt: true,
          trainerProfile: { select: { hasCenterAdmin: true } },
        },
      },
    },
  });
  if (
    !s ||
    !isSessionActive(s, now) ||
    s.user.status === "DELETED" ||
    s.user.suspendedAt
  ) {
    return null;
  }
  const slide = slideSession(s, now);
  if (slide) {
    await db.session.update({ where: { id: s.id }, data: slide });
  }
  return {
    principal: {
      kind: "user",
      userId: s.user.id,
      role: s.user.role,
      hasCenterAdmin: s.user.trainerProfile?.hasCenterAdmin ?? false,
    },
    sessionId: s.id,
    persistent: s.persistent,
    userName: s.user.name,
    userStatus: s.user.status,
  };
}

export async function revokeSessionByToken(
  db: Db,
  token: string,
  now = new Date(),
): Promise<void> {
  await db.session.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: now },
  });
}

/** 로그인된 기기 목록 (만료·로그아웃된 기기 제외) */
export async function listActiveSessions(
  db: Db,
  userId: string,
  now = new Date(),
) {
  return db.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: now } },
    select: {
      id: true,
      deviceLabel: true,
      lastSeenAt: true,
      createdAt: true,
      persistent: true,
    },
    orderBy: { lastSeenAt: "desc" },
  });
}

export async function revokeSession(
  db: Db,
  userId: string,
  sessionId: string,
  now = new Date(),
): Promise<boolean> {
  const r = await db.session.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: now },
  });
  return r.count > 0;
}

/** 모든 기기 로그아웃. exceptSessionId를 주면 그 기기는 남긴다. */
export async function revokeAllSessions(
  db: Db,
  userId: string,
  options: { exceptSessionId?: string } = {},
  now = new Date(),
): Promise<number> {
  const r = await db.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(options.exceptSessionId
        ? { id: { not: options.exceptSessionId } }
        : {}),
    },
    data: { revokedAt: now },
  });
  return r.count;
}
