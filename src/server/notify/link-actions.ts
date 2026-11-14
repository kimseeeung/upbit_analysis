/**
 * 카톡 공유 1회용 링크로 여는 화면의 처리 (명세 4.4, 5.1, 3.5, 3.1).
 * 로그인 없이 링크 토큰으로 본인 확인을 대신한다. 쓰면 끝(1회용).
 */

import type { ShareLinkPurpose } from "@/generated/prisma/client";
import { formatPhone } from "@/lib/phone";
import { describeRules, pickRuleValues } from "@/lib/rules/rule-set";
import type { Db, RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";
import {
  approveWithPin,
  raiseDispute,
} from "@/server/bookings/approval-service";
import { SYSTEM, transition } from "@/server/bookings/core";
import { respondRuleConsent } from "@/server/rules/rule-service";
import { assertTrainerStudent } from "@/server/students/access";
import { respondLinkRequest } from "@/server/students/student-service";
import {
  consumeShareLink,
  createShareLink,
  resolveShareLink,
  shareUrl,
} from "./share-links";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

const PATH: Record<ShareLinkPurpose, string> = {
  CONFIRM_BOOKING: "/l/confirm",
  APPROVE: "/l/approve",
  RULE_CONSENT: "/l/rules",
  TRANSFER_CHOICE: "/l/transfer",
  LINK_REQUEST: "/l/link",
};

/**
 * 트레이너가 "카톡으로 보내기"를 누를 때: 1회용 링크와 보낼 문장.
 * 링크 유효기간: 확정 요청은 수업 시작까지, 완료 승인은 48시간, 규칙 동의·연결은 7일.
 */
export async function createShareForTrainer(
  db: Db,
  input: { trainerId: string; purpose: ShareLinkPurpose; refId: string },
  now = new Date(),
) {
  let expiresAt: Date;
  let text: string;
  if (input.purpose === "CONFIRM_BOOKING" || input.purpose === "APPROVE") {
    const b = await db.booking.findUnique({
      where: { id: input.refId },
      include: { trainer: { select: { name: true } } },
    });
    if (!b || b.trainerId !== input.trainerId)
      throw new AppError("NOT_FOUND", "예약을 찾을 수 없습니다", 404);
    await assertTrainerStudent(db, input.trainerId, b.studentId);
    const when = b.startAt.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    if (input.purpose === "CONFIRM_BOOKING") {
      if (b.status !== "PENDING_CONFIRM")
        throw new AppError("INVALID", "확정 대기 중인 예약이 아닙니다");
      expiresAt = b.startAt;
      text = `[머슬매니아] ${b.trainer.name} 트레이너가 ${when} 수업을 등록했습니다. 아래 링크에서 수락해 주세요.`;
    } else {
      if (b.status !== "PENDING_APPROVAL")
        throw new AppError("INVALID", "완료 승인 대기 중인 수업이 아닙니다");
      expiresAt = new Date(now.getTime() + 48 * HOUR);
      text = `[머슬매니아] ${when} 수업이 끝났습니다. 아래 링크에서 수업 완료를 승인해 주세요.`;
    }
  } else if (input.purpose === "RULE_CONSENT") {
    const c = await db.ruleConsent.findUnique({
      where: { id: input.refId },
      include: { pass: true },
    });
    if (!c || c.pass.soldByTrainerId !== input.trainerId)
      throw new AppError("NOT_FOUND", "요청을 찾을 수 없습니다", 404);
    await assertTrainerStudent(db, input.trainerId, c.studentId);
    expiresAt = new Date(now.getTime() + 7 * DAY);
    text = `[머슬매니아] ${c.pass.name} 수강 규칙을 확인하고 동의해 주세요.`;
  } else if (input.purpose === "LINK_REQUEST") {
    const r = await db.linkRequest.findUnique({
      where: { id: input.refId },
      include: { fromUser: { select: { name: true } } },
    });
    if (!r || r.fromUserId !== input.trainerId || r.status !== "PENDING")
      throw new AppError("NOT_FOUND", "요청을 찾을 수 없습니다", 404);
    expiresAt = new Date(now.getTime() + 7 * DAY);
    text = `[머슬매니아] ${r.fromUser.name} 트레이너가 연결을 요청했습니다.`;
  } else {
    throw new AppError("UNSUPPORTED", "준비 중인 기능입니다");
  }
  // 같은 대상의 이전 링크는 닫는다 (1회용, 가장 최근 링크만 유효)
  await db.shareLink.updateMany({
    where: { purpose: input.purpose, refId: input.refId, usedAt: null },
    data: { usedAt: now },
  });
  const token = await createShareLink(
    db,
    {
      purpose: input.purpose,
      refId: input.refId,
      createdBy: input.trainerId,
      expiresAt,
    },
    now,
  );
  await db.notification.create({
    data: {
      bookingId:
        input.purpose === "CONFIRM_BOOKING" || input.purpose === "APPROVE"
          ? input.refId
          : null,
      type: `SHARE_${input.purpose}`,
      channel: "KAKAO_SHARE",
      title: "카톡 공유",
      body: text,
      scheduledAt: now,
      sendAt: now,
      sentAt: now,
      status: "SENT",
      createdAt: now,
    },
  });
  // 이 예약의 "직접 보내야 함"은 해결
  if (input.purpose === "CONFIRM_BOOKING" || input.purpose === "APPROVE") {
    await db.notification.updateMany({
      where: { bookingId: input.refId, needsManualShare: true },
      data: { needsManualShare: false },
    });
  }
  return { url: shareUrl(`${PATH[input.purpose]}/${token}`), text };
}

const iso = (d: Date) => d.toISOString();

/** 예약 응답 링크 보기 */
export async function viewConfirmLink(db: Db, token: string, now = new Date()) {
  const link = await resolveShareLink(db, token, "CONFIRM_BOOKING", now);
  const b = await db.booking.findUniqueOrThrow({
    where: { id: link.refId },
    include: {
      trainer: { select: { name: true } },
      student: { select: { name: true } },
    },
  });
  return {
    status: b.status,
    startAt: iso(b.startAt),
    endAt: iso(b.endAt),
    trainerName: b.trainer.name,
    studentName: b.student.name,
  };
}

/** 예약 응답 링크: 수락·거절 (가입 불필요) */
export async function actConfirmLink(
  db: RootDb,
  token: string,
  input: { accept: boolean; reason?: string },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const link = await resolveShareLink(tx, token, "CONFIRM_BOOKING", now);
    const b = await tx.booking.findUniqueOrThrow({
      where: { id: link.refId },
      include: { student: { select: { userId: true } } },
    });
    if (b.status !== "PENDING_CONFIRM")
      throw new AppError(
        "INVALID_TRANSITION",
        "이미 응답했거나 바뀐 예약입니다",
        409,
      );
    const by = b.student.userId ?? SYSTEM;
    await transition(tx, b, input.accept ? "CONFIRMED" : "REJECTED", {
      by,
      reason: "카톡 링크 응답",
      now,
      data: input.accept ? {} : { rejectReason: input.reason?.trim() || null },
    });
    await consumeShareLink(tx, link.id, now);
  });
}

/** 완료 승인 링크 보기: 회원은 PIN, 미가입은 가입 화면으로 (이름·전화번호 미리 채움) */
export async function viewApproveLink(db: Db, token: string, now = new Date()) {
  const link = await resolveShareLink(db, token, "APPROVE", now);
  const b = await db.booking.findUniqueOrThrow({
    where: { id: link.refId },
    include: {
      trainer: { select: { name: true } },
      student: { select: { name: true, phone: true, userId: true } },
    },
  });
  return {
    status: b.status,
    disputed: b.disputed,
    startAt: iso(b.startAt),
    endAt: iso(b.endAt),
    trainerName: b.trainer.name,
    registered: !!b.student.userId,
    signupPrefill: b.student.userId
      ? null
      : { name: b.student.name, phone: formatPhone(b.student.phone) },
  };
}

export async function actApproveLink(
  db: RootDb,
  token: string,
  input:
    { action: "APPROVE"; pin: string } | { action: "REJECT"; reason: string },
  now = new Date(),
) {
  const link = await resolveShareLink(db, token, "APPROVE", now);
  const b = await db.booking.findUniqueOrThrow({
    where: { id: link.refId },
    include: { student: { select: { userId: true } } },
  });
  if (!b.student.userId)
    throw new AppError("NOT_REGISTERED", "가입한 뒤 승인할 수 있습니다");
  if (input.action === "APPROVE") {
    await approveWithPin(
      db,
      {
        method: "PIN_APP",
        studentUserId: b.student.userId,
        bookingId: b.id,
        pin: input.pin,
      },
      now,
    );
  } else {
    await raiseDispute(
      db,
      {
        studentUserId: b.student.userId,
        bookingId: b.id,
        reason: input.reason,
      },
      now,
    );
  }
  await consumeShareLink(db, link.id, now);
}

export async function viewRulesLink(db: Db, token: string, now = new Date()) {
  const link = await resolveShareLink(db, token, "RULE_CONSENT", now);
  const c = await db.ruleConsent.findUniqueOrThrow({
    where: { id: link.refId },
    include: {
      ruleSet: true,
      pass: { include: { soldByTrainer: { select: { name: true } } } },
    },
  });
  return {
    status: c.status,
    passName: c.pass.name,
    trainerName: c.pass.soldByTrainer.name,
    rules: describeRules(pickRuleValues(c.ruleSet)),
  };
}

export async function actRulesLink(
  db: RootDb,
  token: string,
  input: { action: "AGREE" | "INQUIRE"; inquiryText?: string },
  now = new Date(),
) {
  const link = await resolveShareLink(db, token, "RULE_CONSENT", now);
  await respondRuleConsent(
    db,
    {
      studentUserId: null,
      consentId: link.refId,
      action: input.action,
      inquiryText: input.inquiryText,
    },
    now,
  );
  if (input.action === "AGREE") await consumeShareLink(db, link.id, now);
}

export async function viewLinkRequestLink(
  db: Db,
  token: string,
  now = new Date(),
) {
  const link = await resolveShareLink(db, token, "LINK_REQUEST", now);
  const r = await db.linkRequest.findUniqueOrThrow({
    where: { id: link.refId },
    include: {
      fromUser: {
        select: {
          name: true,
          trainerProfile: { select: { workplaceText: true } },
        },
      },
    },
  });
  return {
    status: r.status,
    trainerName: r.fromUser.name,
    workplace: r.fromUser.trainerProfile?.workplaceText ?? null,
  };
}

export async function actLinkRequestLink(
  db: RootDb,
  token: string,
  accept: boolean,
  now = new Date(),
) {
  const link = await resolveShareLink(db, token, "LINK_REQUEST", now);
  const r = await db.linkRequest.findUniqueOrThrow({
    where: { id: link.refId },
  });
  await respondLinkRequest(
    db,
    { userId: r.toUserId, requestId: r.id, accept },
    now,
  );
  await consumeShareLink(db, link.id, now);
}
