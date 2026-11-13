import { randomBytes } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";
import type { MembershipWindow } from "@/lib/center/scope";
import {
  DEFAULT_RULES,
  pickRuleValues,
  sameRules,
  type RuleValues,
} from "@/lib/rules/rule-set";
import { isValidMobilePhone, normalizePhone } from "@/lib/phone";
import type { Db, RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";
import { queueNotification } from "@/server/notify/notify-service";

const DAY = 86400_000;

/** 이 회원이 관리하는 센터 (해산 진행 중 포함). 없으면 403 */
export async function requireCenterAdmin(db: Db, userId: string) {
  const admin = await db.centerAdmin.findFirst({
    where: { userId, center: { status: { in: ["ACTIVE", "DISSOLVING"] } } },
    include: { center: true },
  });
  if (!admin)
    throw new AppError("FORBIDDEN", "센터 관리자 권한이 없습니다", 403);
  const windows = await membershipWindows(db, admin.centerId);
  return {
    center: admin.center,
    windows,
    members: windows.filter((w) => w.leftAt === null).map((w) => w.trainerId),
  };
}

/** 센터 소속 기간 (가입~해제) */
export async function membershipWindows(
  db: Db,
  centerId: string,
): Promise<MembershipWindow[]> {
  const rows = await db.centerMembership.findMany({
    where: {
      centerId,
      status: { in: ["ACTIVE", "LEFT"] },
      joinedAt: { not: null },
    },
  });
  return rows.map((m) => ({
    trainerId: m.trainerId,
    joinedAt: m.joinedAt!,
    leftAt: m.status === "LEFT" ? (m.leftAt ?? new Date(0)) : null,
  }));
}

/** 트레이너의 지금 소속 (ACTIVE 하나) */
export async function activeMembership(db: Db, trainerId: string) {
  return db.centerMembership.findFirst({
    where: { trainerId, status: "ACTIVE" },
    include: { center: true },
  });
}

async function audit(
  db: Db,
  actorId: string,
  entity: string,
  entityId: string,
  action: string,
  after?: unknown,
  now = new Date(),
) {
  await writeAuditLog(db, {
    actor: { type: "USER", id: actorId },
    entity,
    entityId,
    action,
    after,
    at: now,
  });
}

/** 트레이너 계정에서 "센터 만들기" (9.1): 센터 관리자 권한이 더해지고 그 센터 소속이 된다 */
export async function createCenterForTrainer(
  db: RootDb,
  trainerId: string,
  input: {
    name: string;
    address: string;
    phone: string;
    bizNo?: string | null;
  },
  now = new Date(),
) {
  const name = input.name.trim();
  const address = input.address.trim();
  if (!name || !address)
    throw new AppError("INVALID", "센터명과 주소를 입력해 주세요");
  if (
    !isValidMobilePhone(input.phone) &&
    normalizePhone(input.phone).length < 9
  )
    throw new AppError("INVALID", "대표 전화를 확인해 주세요");
  const bizNo = input.bizNo ? input.bizNo.replace(/\D/g, "") : null;
  if (bizNo && bizNo.length !== 10)
    throw new AppError("INVALID", "사업자등록번호 10자리를 확인해 주세요");
  return db.$transaction(async (tx) => {
    if (await activeMembership(tx, trainerId)) {
      throw new AppError(
        "HAS_CENTER",
        "이미 다른 센터에 소속되어 있습니다. 소속을 해제한 뒤 만들 수 있습니다",
      );
    }
    if (
      await tx.centerAdmin.findFirst({
        where: { userId: trainerId, center: { status: { not: "DISSOLVED" } } },
      })
    ) {
      throw new AppError("HAS_CENTER", "이미 관리하는 센터가 있습니다");
    }
    const center = await tx.center.create({
      data: {
        name,
        address,
        phone: normalizePhone(input.phone),
        bizNo,
        verified: !!bizNo,
      },
    });
    await tx.centerAdmin.create({
      data: { centerId: center.id, userId: trainerId, addedAt: now },
    });
    await tx.trainerProfile.update({
      where: { userId: trainerId },
      data: { hasCenterAdmin: true },
    });
    await tx.centerMembership.updateMany({
      where: { trainerId, status: "PENDING" },
      data: { status: "LEFT", leftAt: now },
    });
    await tx.centerMembership.create({
      data: {
        centerId: center.id,
        trainerId,
        status: "ACTIVE",
        approvedAt: now,
        approvedBy: trainerId,
        consentAt: now,
        joinedAt: now,
      },
    });
    await audit(
      tx,
      trainerId,
      "Center",
      center.id,
      "center.create",
      { name },
      now,
    );
    return center;
  });
}

/** 트레이너: 센터를 골라 소속 요청 (9.2-1) */
export async function requestMembership(
  db: RootDb,
  trainerId: string,
  centerId: string,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const center = await tx.center.findFirst({
      where: { id: centerId, status: "ACTIVE" },
    });
    if (!center)
      throw new AppError("NOT_FOUND", "센터를 찾을 수 없습니다", 404);
    if (await activeMembership(tx, trainerId))
      throw new AppError(
        "HAS_CENTER",
        "센터는 한 곳에만 소속할 수 있습니다. 기존 소속을 먼저 해제해 주세요",
      );
    await tx.centerMembership.updateMany({
      where: { trainerId, status: "PENDING" },
      data: { status: "LEFT", leftAt: now },
    });
    const m = await tx.centerMembership.create({
      data: { centerId, trainerId, createdAt: now },
    });
    await audit(
      tx,
      trainerId,
      "CenterMembership",
      m.id,
      "center.joinRequest",
      { centerId },
      now,
    );
    const admins = await tx.centerAdmin.findMany({ where: { centerId } });
    const trainer = await tx.user.findUniqueOrThrow({
      where: { id: trainerId },
    });
    for (const a of admins) {
      await queueNotification(
        tx,
        {
          userId: a.userId,
          type: "CENTER_JOIN_REQUEST",
          title: "소속 요청",
          body: `${trainer.name} 트레이너가 센터 소속을 요청했습니다.`,
          url: "/c/trainers",
        },
        now,
      );
    }
    return m;
  });
}

/** 센터 관리자: 소속 요청 승인·거절 (9.2-2). 승인 뒤 트레이너 동의로 소속 완료 */
export async function respondMembership(
  db: RootDb,
  adminId: string,
  membershipId: string,
  approve: boolean,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const { center } = await requireCenterAdmin(tx, adminId);
    const m = await tx.centerMembership.findFirst({
      where: {
        id: membershipId,
        centerId: center.id,
        status: "PENDING",
        approvedAt: null,
      },
    });
    if (!m) throw new AppError("NOT_FOUND", "요청을 찾을 수 없습니다", 404);
    await tx.centerMembership.update({
      where: { id: m.id },
      data: approve
        ? { approvedAt: now, approvedBy: adminId }
        : { status: "LEFT", leftAt: now },
    });
    await audit(
      tx,
      adminId,
      "CenterMembership",
      m.id,
      approve ? "center.joinApprove" : "center.joinReject",
      undefined,
      now,
    );
    await queueNotification(
      tx,
      {
        userId: m.trainerId,
        type: "CENTER_JOIN_RESULT",
        title: approve ? "소속 승인" : "소속 거절",
        body: approve
          ? `${center.name} 소속이 승인되었습니다. 기록 공개에 동의하면 소속이 완료됩니다.`
          : `${center.name} 소속 요청이 거절되었습니다.`,
        url: "/t/me",
      },
      now,
    );
  });
}

/** 트레이너: "일정·수강생·이용권·결제 기록을 센터가 볼 수 있음"에 동의 (9.2-3) → 소속 완료 */
export async function consentMembership(
  db: RootDb,
  trainerId: string,
  membershipId: string,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const m = await tx.centerMembership.findFirst({
      where: {
        id: membershipId,
        trainerId,
        status: "PENDING",
        approvedAt: { not: null },
      },
    });
    if (!m) throw new AppError("NOT_FOUND", "동의할 소속 요청이 없습니다", 404);
    if (await activeMembership(tx, trainerId))
      throw new AppError("HAS_CENTER", "이미 다른 센터에 소속되어 있습니다");
    await tx.centerMembership.update({
      where: { id: m.id },
      data: { status: "ACTIVE", consentAt: now, joinedAt: now },
    });
    await audit(
      tx,
      trainerId,
      "CenterMembership",
      m.id,
      "center.joinConsent",
      undefined,
      now,
    );
  });
}

/** 초대 코드 만들기 (트레이너 초대 또는 관리자 초대), 7일 유효 */
export async function createInvite(
  db: RootDb,
  adminId: string,
  kind: "TRAINER" | "ADMIN",
  now = new Date(),
) {
  const { center } = await requireCenterAdmin(db, adminId);
  if (center.status !== "ACTIVE")
    throw new AppError("INVALID", "해산 중인 센터입니다");
  const code = randomBytes(6)
    .toString("base64url")
    .replace(/[-_]/g, "x")
    .slice(0, 8)
    .toUpperCase();
  const invite = await db.centerInvite.create({
    data: {
      centerId: center.id,
      kind,
      code,
      createdBy: adminId,
      expiresAt: new Date(now.getTime() + 7 * DAY),
    },
  });
  await audit(
    db,
    adminId,
    "CenterInvite",
    invite.id,
    "center.invite",
    { kind },
    now,
  );
  return { code, expiresAt: invite.expiresAt };
}

async function useInvite(
  tx: Db,
  code: string,
  userId: string,
  kind: "TRAINER" | "ADMIN",
  now: Date,
) {
  const inv = await tx.centerInvite.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: { center: true },
  });
  if (
    !inv ||
    inv.kind !== kind ||
    inv.usedAt ||
    inv.expiresAt <= now ||
    inv.center.status !== "ACTIVE"
  ) {
    throw new AppError("INVALID", "사용할 수 없는 초대 코드입니다");
  }
  await tx.centerInvite.update({
    where: { id: inv.id },
    data: { usedAt: now, usedBy: userId },
  });
  return inv;
}

/** 트레이너: 초대 코드로 소속 (센터가 초대했으므로 관리자 승인 생략, 기록 공개 동의와 함께) */
export async function joinWithInvite(
  db: RootDb,
  trainerId: string,
  code: string,
  consent: boolean,
  now = new Date(),
) {
  if (!consent)
    throw new AppError(
      "CONSENT_REQUIRED",
      "센터가 기록을 볼 수 있다는 데 동의해 주세요",
    );
  return db.$transaction(async (tx) => {
    if (await activeMembership(tx, trainerId))
      throw new AppError(
        "HAS_CENTER",
        "센터는 한 곳에만 소속할 수 있습니다. 기존 소속을 먼저 해제해 주세요",
      );
    const inv = await useInvite(tx, code, trainerId, "TRAINER", now);
    await tx.centerMembership.updateMany({
      where: { trainerId, status: "PENDING" },
      data: { status: "LEFT", leftAt: now },
    });
    const m = await tx.centerMembership.create({
      data: {
        centerId: inv.centerId,
        trainerId,
        status: "ACTIVE",
        approvedAt: now,
        approvedBy: inv.createdBy,
        consentAt: now,
        joinedAt: now,
      },
    });
    await audit(
      tx,
      trainerId,
      "CenterMembership",
      m.id,
      "center.joinByInvite",
      { centerId: inv.centerId },
      now,
    );
    return inv.center;
  });
}

/** 관리자 초대 수락 (9.1: 기존 관리자가 초대). 트레이너면 "트레이너 + 센터 권한" */
export async function acceptAdminInvite(
  db: RootDb,
  userId: string,
  code: string,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role === "STUDENT")
      throw new AppError(
        "FORBIDDEN",
        "수강생은 센터 관리자가 될 수 없습니다",
        403,
      );
    if (
      await tx.centerAdmin.findFirst({
        where: { userId, center: { status: { not: "DISSOLVED" } } },
      })
    ) {
      throw new AppError("HAS_CENTER", "이미 관리하는 센터가 있습니다");
    }
    const inv = await useInvite(tx, code, userId, "ADMIN", now);
    await tx.centerAdmin.create({
      data: {
        centerId: inv.centerId,
        userId,
        invitedBy: inv.createdBy,
        addedAt: now,
      },
    });
    if (user.role === "TRAINER")
      await tx.trainerProfile.update({
        where: { userId },
        data: { hasCenterAdmin: true },
      });
    await audit(
      tx,
      userId,
      "CenterAdmin",
      inv.centerId,
      "center.adminAdded",
      { invitedBy: inv.createdBy },
      now,
    );
    return inv.center;
  });
}

/** 센터 기본 수강 규칙 (트레이너 초기값) */
export async function getCenterDefaultRules(db: Db, centerId: string) {
  const r = await db.ruleSet.findFirst({
    where: { kind: "CENTER_DEFAULT", ownerCenterId: centerId },
    orderBy: { version: "desc" },
  });
  return r
    ? { version: r.version, rules: pickRuleValues(r) }
    : { version: 0, rules: DEFAULT_RULES };
}

export async function updateCenterDefaultRules(
  db: RootDb,
  adminId: string,
  values: RuleValues,
  now = new Date(),
) {
  const { center } = await requireCenterAdmin(db, adminId);
  const cur = await getCenterDefaultRules(db, center.id);
  if (cur.version > 0 && sameRules(cur.rules, values)) return cur;
  await db.ruleSet.create({
    data: {
      kind: "CENTER_DEFAULT",
      ownerCenterId: center.id,
      version: cur.version + 1,
      ...values,
    },
  });
  await audit(db, adminId, "Center", center.id, "center.rules", values, now);
  return { version: cur.version + 1, rules: values };
}

/**
 * 센터 해산 (9.4): 소속 트레이너 전원에게 7일 전 알림 → 7일 뒤 개인 트레이너로 전환.
 * 수강생·이용권·기록은 그대로. 센터 통계·결제 화면은 해산 뒤 없어진다.
 */
export async function startDissolve(
  db: RootDb,
  adminId: string,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const { center, members } = await requireCenterAdmin(tx, adminId);
    if (center.status !== "ACTIVE")
      throw new AppError("INVALID", "이미 해산 중입니다");
    const dissolveAt = new Date(now.getTime() + 7 * DAY);
    await tx.center.update({
      where: { id: center.id },
      data: { status: "DISSOLVING", dissolveAt },
    });
    for (const t of members) {
      await queueNotification(
        tx,
        {
          userId: t,
          type: "CENTER_DISSOLVE",
          title: "센터 해산 예정",
          body: `${center.name}이(가) 7일 뒤 해산되어 개인 트레이너로 바뀝니다. 수강생·이용권·기록은 그대로입니다.`,
          url: "/t/me",
        },
        now,
      );
    }
    await audit(
      tx,
      adminId,
      "Center",
      center.id,
      "center.dissolveStart",
      { dissolveAt },
      now,
    );
    return { dissolveAt };
  });
}

/** 해산 처리: 소속 해제, 관리자 권한 제거 */
export async function finishDissolve(tx: Db, centerId: string, now: Date) {
  await tx.centerMembership.updateMany({
    where: { centerId, status: "ACTIVE" },
    data: { status: "LEFT", leftAt: now },
  });
  await tx.centerMembership.updateMany({
    where: { centerId, status: "PENDING" },
    data: { status: "LEFT", leftAt: now },
  });
  const admins = await tx.centerAdmin.findMany({ where: { centerId } });
  for (const a of admins) {
    const others = await tx.centerAdmin.count({
      where: {
        userId: a.userId,
        centerId: { not: centerId },
        center: { status: { not: "DISSOLVED" } },
      },
    });
    if (others === 0)
      await tx.trainerProfile.updateMany({
        where: { userId: a.userId },
        data: { hasCenterAdmin: false },
      });
  }
  await tx.center.update({
    where: { id: centerId },
    data: { status: "DISSOLVED" },
  });
  await writeAuditLog(tx, {
    actor: { type: "SYSTEM" },
    entity: "Center",
    entityId: centerId,
    action: "center.dissolved",
    at: now,
  });
}

/** 마지막 센터 관리자는 다른 관리자 지정 또는 해산을 먼저 해야 탈퇴할 수 있다 (9.5) */
export async function canAdminWithdraw(
  db: Db,
  userId: string,
): Promise<{ ok: true } | { ok: false; centerName: string }> {
  const mine = await db.centerAdmin.findMany({
    where: { userId, center: { status: "ACTIVE" } },
    include: { center: true },
  });
  for (const a of mine) {
    const others = await db.centerAdmin.count({
      where: { centerId: a.centerId, userId: { not: userId } },
    });
    if (others === 0) return { ok: false, centerName: a.center.name };
  }
  return { ok: true };
}
