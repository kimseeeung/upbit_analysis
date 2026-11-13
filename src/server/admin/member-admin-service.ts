import type { NotificationStatus } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";

const STATUSES: NotificationStatus[] = [
  "SCHEDULED",
  "SENT",
  "FAILED",
  "SKIPPED",
  "CANCELED",
];
import { maskLoginId } from "@/lib/auth/policy";
import { maskPhone, normalizePhone } from "@/lib/phone";
import type { Db, RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";

function maskName(name: string) {
  if (name.length <= 1) return name;
  if (name.length === 2) return `${name[0]}*`;
  return `${name[0]}${"*".repeat(name.length - 2)}${name.at(-1)}`;
}

async function logAccess(
  db: Db,
  operatorId: string,
  targetUserId: string,
  action: string,
  at: Date,
) {
  await db.operatorAccessLog.create({
    data: { operatorId, targetUserId, action, at },
  });
}

/** 회원 검색: 목록에는 가린 값만 보이고, 열어 볼 때 조회 기록을 남긴다 (12.4) */
export async function searchMembers(db: Db, q: string) {
  const query = q.trim();
  if (query.length < 2) return [];
  const digits = normalizePhone(query);
  const rows = await db.user.findMany({
    where: {
      status: { not: "DELETED" },
      OR: [
        { name: { contains: query } },
        { loginId: { equals: query } },
        ...(digits.length >= 4 ? [{ phone: { endsWith: digits } }] : []),
      ],
    },
    take: 50,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      loginId: true,
      phone: true,
      role: true,
      status: true,
      suspendedAt: true,
      createdAt: true,
    },
  });
  return rows.map((u) => ({
    id: u.id,
    name: maskName(u.name),
    loginId: maskLoginId(u.loginId),
    phone: maskPhone(u.phone),
    role: u.role,
    status: u.status,
    suspended: !!u.suspendedAt,
    createdAt: u.createdAt,
  }));
}

/** 회원 정보 조회. 조회할 때마다 누가·언제·누구를 기록 */
export async function getMemberDetail(
  db: RootDb,
  operatorId: string,
  userId: string,
  now = new Date(),
) {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      loginId: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
      suspendedAt: true,
      suspendReason: true,
      withdrawRequestedAt: true,
      deleteScheduledAt: true,
      sessions: {
        where: { revokedAt: null, expiresAt: { gt: now } },
        select: { deviceLabel: true, lastSeenAt: true },
        orderBy: { lastSeenAt: "desc" },
      },
    },
  });
  if (!u || u.status === "DELETED")
    throw new AppError("NOT_FOUND", "회원을 찾을 수 없습니다", 404);
  await logAccess(db, operatorId, userId, "VIEW", now);
  const accessLogs = await db.operatorAccessLog.findMany({
    where: { targetUserId: userId },
    orderBy: { at: "desc" },
    take: 20,
    include: { operator: { select: { name: true } } },
  });
  return {
    ...u,
    phone: maskPhone(u.phone),
    accessLogs: accessLogs.map((l) => ({
      operatorName: l.operator.name,
      action: l.action,
      at: l.at,
    })),
  };
}

/** 정지·해제. 정지하면 모든 기기에서 로그아웃 */
export async function setMemberSuspended(
  db: RootDb,
  operatorId: string,
  userId: string,
  input: { suspend: boolean; reason?: string },
  now = new Date(),
) {
  const reason = input.reason?.trim() ?? "";
  if (input.suspend && reason.length < 2)
    throw new AppError("INVALID", "정지 사유를 입력해 주세요");
  await db.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId } });
    if (!u || u.status === "DELETED")
      throw new AppError("NOT_FOUND", "회원을 찾을 수 없습니다", 404);
    await tx.user.update({
      where: { id: userId },
      data: input.suspend
        ? { suspendedAt: now, suspendReason: reason }
        : { suspendedAt: null, suspendReason: null },
    });
    if (input.suspend)
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
    await logAccess(
      tx,
      operatorId,
      userId,
      input.suspend ? "SUSPEND" : "UNSUSPEND",
      now,
    );
    await writeAuditLog(tx, {
      actor: { type: "OPERATOR", id: operatorId },
      entity: "User",
      entityId: userId,
      action: input.suspend ? "user.suspend" : "user.unsuspend",
      before: { suspendedAt: u.suspendedAt },
      after: input.suspend
        ? { suspendedAt: now, reason }
        : { suspendedAt: null },
      at: now,
    });
  });
}

/** 알림 발송 내역 (12.4). 받는 사람 이름은 가린다 */
export async function listNotificationHistory(
  db: Db,
  input: { status?: string },
) {
  const rows = await db.notification.findMany({
    where:
      input.status && STATUSES.includes(input.status as NotificationStatus)
        ? { status: input.status as NotificationStatus }
        : {},
    orderBy: { sendAt: "desc" },
    take: 200,
    include: { user: { select: { name: true } } },
  });
  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    channel: n.channel,
    title: n.title,
    status: n.status,
    sendAt: n.sendAt,
    sentAt: n.sentAt,
    failReason: n.failReason,
    recipient: n.user ? maskName(n.user.name) : "미가입 수강생",
  }));
}

export { maskName };
