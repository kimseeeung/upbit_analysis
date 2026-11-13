import { hashSecret } from "@/lib/auth/hash";
import { hashSessionToken, newSessionToken } from "@/lib/auth/session-rules";
import { OPERATOR_INVITE_MS, canDisableOperator } from "@/lib/admin/rules";
import { writeAuditLog } from "@/lib/audit";
import { isValidMobilePhone, maskPhone, normalizePhone } from "@/lib/phone";
import type { Db, RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";
import { consumeVerification, issueCode } from "@/server/auth/sms-service";
import { validateOperatorCredentials } from "./operator-auth";

/** 다른 관리자 전원에게 알림 (12.2) */
export async function alertOtherOperators(
  db: Db,
  exceptId: string | null,
  message: string,
  now = new Date(),
) {
  const others = await db.operatorAccount.findMany({
    where: { status: "ACTIVE", ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (others.length === 0) return;
  await db.operatorAlert.createMany({
    data: others.map((o) => ({ operatorId: o.id, message, createdAt: now })),
  });
}

export async function listOperators(db: Db) {
  const rows = await db.operatorAccount.findMany({
    orderBy: { createdAt: "asc" },
    include: { invitedBy: { select: { name: true } } },
  });
  return rows.map((o) => ({
    id: o.id,
    name: o.name,
    loginId: o.loginId,
    phone: maskPhone(o.phone),
    status: o.status,
    invitedByName: o.invitedBy?.name ?? null,
    createdAt: o.createdAt,
    activatedAt: o.activatedAt,
    lastLoginAt: o.lastLoginAt,
    inviteExpiresAt: o.status === "INVITED" ? o.inviteExpiresAt : null,
  }));
}

/** 이름·휴대폰 번호로 초대. 링크는 한 번만 보여 준다 */
export async function inviteOperator(
  db: RootDb,
  byId: string,
  input: { name: string; phone: string },
  now = new Date(),
): Promise<{ operatorId: string; token: string }> {
  const name = input.name?.trim();
  const phone = normalizePhone(input.phone ?? "");
  if (!name) throw new AppError("INVALID", "이름을 입력해 주세요");
  if (!isValidMobilePhone(phone))
    throw new AppError("INVALID_PHONE", "휴대폰 번호를 확인해 주세요");
  const dup = await db.operatorAccount.findFirst({
    where: { phone, status: { in: ["INVITED", "ACTIVE"] } },
  });
  if (dup)
    throw new AppError("DUPLICATE", "이미 초대했거나 활성인 관리자 번호입니다");
  const token = newSessionToken();
  const by = await db.operatorAccount.findUniqueOrThrow({
    where: { id: byId },
  });
  const op = await db.$transaction(async (tx) => {
    const op = await tx.operatorAccount.create({
      data: {
        name,
        phone,
        status: "INVITED",
        invitedById: byId,
        inviteTokenHash: hashSessionToken(token),
        inviteExpiresAt: new Date(now.getTime() + OPERATOR_INVITE_MS),
        createdAt: now,
      },
    });
    await writeAuditLog(tx, {
      actor: { type: "OPERATOR", id: byId },
      entity: "OperatorAccount",
      entityId: op.id,
      action: "operator.invite",
      after: { name, phone: maskPhone(phone) },
      at: now,
    });
    await alertOtherOperators(
      tx,
      byId,
      `${by.name}님이 ${name}님을 운영 관리자로 초대했습니다`,
      now,
    );
    return op;
  });
  return { operatorId: op.id, token };
}

async function findInvite(db: Db, token: string, now: Date) {
  const op = await db.operatorAccount.findUnique({
    where: { inviteTokenHash: hashSessionToken(token) },
  });
  if (
    !op ||
    op.status !== "INVITED" ||
    !op.inviteExpiresAt ||
    op.inviteExpiresAt <= now
  )
    throw new AppError(
      "INVITE_INVALID",
      "유효하지 않거나 만료된 초대입니다",
      404,
    );
  return op;
}

export async function getInvite(db: Db, token: string, now = new Date()) {
  const op = await findInvite(db, token, now);
  return { name: op.name, phoneHint: maskPhone(op.phone) };
}

/** 초대받은 번호로만 인증번호를 보낸다 (번호를 입력받지 않음) */
export async function sendInviteCode(db: Db, token: string, now = new Date()) {
  const op = await findInvite(db, token, now);
  return issueCode(db, op.phone, "ADMIN_2FA", now);
}

/** 아이디·비밀번호·롤백 PIN 직접 설정 + 휴대폰 인증 → 활성화 (12.2) */
export async function acceptInvite(
  db: RootDb,
  token: string,
  input: {
    loginId: string;
    password: string;
    rollbackPin: string;
    verificationId: string;
  },
  now = new Date(),
) {
  const op = await findInvite(db, token, now);
  const loginId = input.loginId?.trim() ?? "";
  validateOperatorCredentials({
    loginId,
    password: input.password ?? "",
    rollbackPin: input.rollbackPin ?? "",
  });
  if (await db.operatorAccount.findUnique({ where: { loginId } }))
    throw new AppError("LOGIN_ID_TAKEN", "이미 쓰는 아이디입니다");
  const pw = await hashSecret(input.password);
  const pin = await hashSecret(input.rollbackPin);
  await db.$transaction(async (tx) => {
    await consumeVerification(
      tx,
      {
        verificationId: input.verificationId,
        purpose: "ADMIN_2FA",
        phone: op.phone,
      },
      now,
    );
    const r = await tx.operatorAccount.updateMany({
      where: { id: op.id, status: "INVITED" },
      data: {
        loginId,
        passwordHash: pw.hash,
        passwordSalt: pw.salt,
        rollbackPinHash: pin.hash,
        rollbackPinSalt: pin.salt,
        status: "ACTIVE",
        activatedAt: now,
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
    });
    if (r.count !== 1)
      throw new AppError(
        "INVITE_INVALID",
        "유효하지 않거나 만료된 초대입니다",
        404,
      );
    await writeAuditLog(tx, {
      actor: { type: "OPERATOR", id: op.id },
      entity: "OperatorAccount",
      entityId: op.id,
      action: "operator.activate",
      after: { loginId },
      at: now,
    });
    await alertOtherOperators(
      tx,
      op.id,
      `${op.name}님이 운영 관리자로 활성화되었습니다`,
      now,
    );
  });
}

/**
 * 비활성화 (12.2). 최소 1명은 항상 활성.
 * 동시에 두 명을 비활성화해 0명이 되지 않도록 잠금을 잡고 다시 센다.
 */
export async function disableOperator(
  db: RootDb,
  byId: string,
  targetId: string,
  now = new Date(),
) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('operator:roster'))`;
    const all = await tx.operatorAccount.findMany({
      select: { id: true, status: true, name: true },
    });
    const target = all.find((o) => o.id === targetId);
    if (!target)
      throw new AppError("NOT_FOUND", "관리자를 찾을 수 없습니다", 404);
    if (!canDisableOperator(all, targetId))
      throw new AppError(
        target.status === "DISABLED" ? "ALREADY_DISABLED" : "LAST_OPERATOR",
        target.status === "DISABLED"
          ? "이미 비활성화된 관리자입니다"
          : "활성 관리자는 최소 1명 있어야 합니다",
        409,
      );
    await tx.operatorAccount.update({
      where: { id: targetId },
      data: {
        status: "DISABLED",
        disabledAt: now,
        disabledById: byId,
        inviteTokenHash: null,
      },
    });
    await tx.operatorSession.updateMany({
      where: { operatorId: targetId, revokedAt: null },
      data: { revokedAt: now },
    });
    await writeAuditLog(tx, {
      actor: { type: "OPERATOR", id: byId },
      entity: "OperatorAccount",
      entityId: targetId,
      action: "operator.disable",
      before: { status: target.status },
      after: { status: "DISABLED" },
      at: now,
    });
    const by = all.find((o) => o.id === byId);
    await alertOtherOperators(
      tx,
      byId,
      `${by?.name ?? "관리자"}님이 ${target.name}님을 ${target.status === "INVITED" ? "초대 취소" : "비활성화"}했습니다`,
      now,
    );
  });
}

export async function listAlerts(db: Db, operatorId: string) {
  return db.operatorAlert.findMany({
    where: { operatorId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function markAlertsRead(
  db: Db,
  operatorId: string,
  now = new Date(),
) {
  await db.operatorAlert.updateMany({
    where: { operatorId, readAt: null },
    data: { readAt: now },
  });
}
