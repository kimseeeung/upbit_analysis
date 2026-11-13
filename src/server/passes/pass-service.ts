import { writeAuditLog } from "@/lib/audit";
import {
  pickRuleValues,
  sameRules,
  type RuleValues,
} from "@/lib/rules/rule-set";
import { parseKstDateKey, toKstDateKey } from "@/lib/time";
import type { RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";
import {
  requestRuleConsent,
  resolveRuleSetForPass,
} from "@/server/rules/rule-service";
import { assertTrainerStudent } from "@/server/students/access";

export interface PassInput {
  name: string;
  count: number;
  bonusCount?: number;
  startDate: string;
  endDate: string;
  sessionMinutes?: number;
  price?: number | null;
  paidAt?: string | null;
  payMethod?: string | null;
  memo?: string | null;
  /** 수강생별로 고친 규칙. 없으면 트레이너 기본 규칙 */
  rules?: RuleValues | null;
}

function toDate(key: string, label: string) {
  try {
    return parseKstDateKey(key);
  } catch {
    throw new AppError("INVALID", `${label}을(를) 확인해 주세요`);
  }
}

function validate(input: PassInput) {
  const name = input.name?.trim();
  if (!name) throw new AppError("INVALID", "이용권명을 입력해 주세요");
  if (name.length > 50)
    throw new AppError("INVALID", "이용권명은 50자까지 입력할 수 있습니다");
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 999) {
    throw new AppError("INVALID", "등록 횟수는 1~999회여야 합니다");
  }
  const bonus = input.bonusCount ?? 0;
  if (!Number.isInteger(bonus) || bonus < 0 || bonus > 999) {
    throw new AppError("INVALID", "서비스 횟수는 0~999회여야 합니다");
  }
  const start = toDate(input.startDate, "시작일");
  const end = toDate(input.endDate, "만료일");
  if (end < start)
    throw new AppError("INVALID", "만료일은 시작일 뒤여야 합니다");
  const minutes = input.sessionMinutes ?? 50;
  if (
    !Number.isInteger(minutes) ||
    minutes < 10 ||
    minutes > 240 ||
    minutes % 5 !== 0
  ) {
    throw new AppError(
      "INVALID",
      "1회 수업 시간은 10~240분, 5분 단위여야 합니다",
    );
  }
  if (
    input.price != null &&
    (!Number.isInteger(input.price) || input.price < 0)
  ) {
    throw new AppError("INVALID", "결제 금액을 확인해 주세요");
  }
  return {
    name,
    count: input.count,
    bonusCount: bonus,
    startDate: start,
    endDate: end,
    sessionMinutes: minutes,
    price: input.price ?? null,
    paidAt: input.paidAt ? toDate(input.paidAt, "결제일") : null,
    payMethod: input.payMethod?.trim() || null,
    memo: input.memo?.trim() || null,
  };
}

/** 이용권 등록: 저장하면 바로 "사용 중", 수강생에게 규칙 동의 요청 (3.2) */
export async function createPass(
  db: RootDb,
  trainerId: string,
  studentId: string,
  input: PassInput,
  now = new Date(),
) {
  const data = validate(input);
  return db.$transaction(async (tx) => {
    await assertTrainerStudent(tx, trainerId, studentId);
    const ruleSet = await resolveRuleSetForPass(
      tx,
      trainerId,
      input.rules ?? null,
    );
    const pass = await tx.pass.create({
      data: {
        ...data,
        studentId,
        soldByTrainerId: trainerId,
        ruleSetVersionId: ruleSet.id,
        status: "ACTIVE",
        createdAt: now,
      },
    });
    await writeAuditLog(tx, {
      actor: { type: "USER", id: trainerId },
      entity: "Pass",
      entityId: pass.id,
      action: "pass.create",
      after: {
        ...data,
        startDate: input.startDate,
        endDate: input.endDate,
        ruleSetId: ruleSet.id,
      },
      at: now,
    });
    await requestRuleConsent(tx, pass.id, trainerId, now);
    return pass;
  });
}

async function loadOwnedPass(
  db: RootDb | Parameters<typeof assertTrainerStudent>[0],
  trainerId: string,
  passId: string,
) {
  const pass = await db.pass.findUnique({ where: { id: passId } });
  if (!pass) throw new AppError("NOT_FOUND", "이용권을 찾을 수 없습니다", 404);
  await assertTrainerStudent(db, trainerId, pass.studentId);
  return pass;
}

const TRACKED: Array<keyof ReturnType<typeof validate>> = [
  "name",
  "count",
  "bonusCount",
  "startDate",
  "endDate",
  "sessionMinutes",
  "price",
  "paidAt",
  "payMethod",
  "memo",
];

function show(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return toKstDateKey(v);
  return String(v);
}

/**
 * 이용권 수정. 바뀐 항목마다 변경 이력을 남긴다.
 * 횟수·만료일이 바뀌면 수강생에게 알린다(알림은 M5).
 * 규칙을 바꾸면 새 규칙 버전을 만들고 다시 동의를 요청한다. 동의 전까지 이전 규칙 적용.
 */
export async function updatePass(
  db: RootDb,
  trainerId: string,
  passId: string,
  input: PassInput,
  now = new Date(),
) {
  const data = validate(input);
  return db.$transaction(async (tx) => {
    const before = await loadOwnedPass(tx, trainerId, passId);
    if (before.status === "REFUNDED")
      throw new AppError("INVALID", "환불한 이용권은 고칠 수 없습니다");

    const changes = TRACKED.filter((k) => show(before[k]) !== show(data[k]));
    let ruleSetVersionId = before.ruleSetVersionId;
    if (input.rules) {
      const currentRules = await tx.ruleSet.findUniqueOrThrow({
        where: { id: before.ruleSetVersionId },
      });
      if (!sameRules(pickRuleValues(currentRules), input.rules)) {
        const prevPassVersion =
          currentRules.kind === "PASS" ? currentRules.version : 0;
        const next = await resolveRuleSetForPass(
          tx,
          trainerId,
          input.rules,
          prevPassVersion,
        );
        ruleSetVersionId = next.id;
      }
    }

    const updated = await tx.pass.update({
      where: { id: passId },
      data: {
        ...data,
        ruleSetVersionId,
        status:
          before.status === "EXPIRED" && data.endDate > before.endDate
            ? "ACTIVE"
            : before.status,
      },
    });
    for (const k of changes) {
      await tx.passChangeLog.create({
        data: {
          passId,
          field: k,
          before: show(before[k]),
          after: show(data[k]),
          changedBy: trainerId,
          changedAt: now,
        },
      });
    }
    if (ruleSetVersionId !== before.ruleSetVersionId) {
      await tx.passChangeLog.create({
        data: {
          passId,
          field: "rules",
          before: before.ruleSetVersionId,
          after: ruleSetVersionId,
          changedBy: trainerId,
          changedAt: now,
        },
      });
      await requestRuleConsent(tx, passId, trainerId, now);
    }
    if (changes.length > 0 || ruleSetVersionId !== before.ruleSetVersionId) {
      await writeAuditLog(tx, {
        actor: { type: "USER", id: trainerId },
        entity: "Pass",
        entityId: passId,
        action: "pass.update",
        before: Object.fromEntries(changes.map((k) => [k, show(before[k])])),
        after: Object.fromEntries(changes.map((k) => [k, show(data[k])])),
        at: now,
      });
    }
    return updated;
  });
}

/** 만료일 연장 */
export async function extendPass(
  db: RootDb,
  trainerId: string,
  passId: string,
  endDate: string,
  now = new Date(),
) {
  const p = await loadOwnedPass(db, trainerId, passId);
  const newEnd = toDate(endDate, "만료일");
  if (newEnd <= p.endDate)
    throw new AppError("INVALID", "새 만료일은 지금 만료일보다 뒤여야 합니다");
  return updatePass(db, trainerId, passId, { ...passToInput(p), endDate }, now);
}

/** 서비스 횟수 추가 */
export async function addBonusCount(
  db: RootDb,
  trainerId: string,
  passId: string,
  add: number,
  now = new Date(),
) {
  if (!Number.isInteger(add) || add < 1 || add > 100) {
    throw new AppError("INVALID", "추가할 서비스 횟수는 1~100회여야 합니다");
  }
  const p = await loadOwnedPass(db, trainerId, passId);
  return updatePass(
    db,
    trainerId,
    passId,
    { ...passToInput(p), bonusCount: p.bonusCount + add },
    now,
  );
}

/** 환불 처리: 상태만 바꾼다. 실제 환불은 앱 밖에서 */
export async function refundPass(
  db: RootDb,
  trainerId: string,
  passId: string,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const p = await loadOwnedPass(tx, trainerId, passId);
    if (p.status === "REFUNDED")
      throw new AppError("INVALID", "이미 환불 처리한 이용권입니다");
    const updated = await tx.pass.update({
      where: { id: passId },
      data: { status: "REFUNDED", refundedAt: now },
    });
    await tx.passChangeLog.create({
      data: {
        passId,
        field: "status",
        before: p.status,
        after: "REFUNDED",
        changedBy: trainerId,
        changedAt: now,
      },
    });
    await writeAuditLog(tx, {
      actor: { type: "USER", id: trainerId },
      entity: "Pass",
      entityId: passId,
      action: "pass.refund",
      before: { status: p.status },
      after: { status: "REFUNDED" },
      at: now,
    });
    return updated;
  });
}

function passToInput(p: {
  name: string;
  count: number;
  bonusCount: number;
  startDate: Date;
  endDate: Date;
  sessionMinutes: number;
  price: number | null;
  paidAt: Date | null;
  payMethod: string | null;
  memo: string | null;
}): PassInput {
  return {
    name: p.name,
    count: p.count,
    bonusCount: p.bonusCount,
    startDate: toKstDateKey(p.startDate),
    endDate: toKstDateKey(p.endDate),
    sessionMinutes: p.sessionMinutes,
    price: p.price,
    paidAt: p.paidAt ? toKstDateKey(p.paidAt) : null,
    payMethod: p.payMethod,
    memo: p.memo,
  };
}
