import { randomBytes } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";
import {
  DELETED_STUDENT_NAME,
  DELETED_TRAINER_NAME,
  canCancelWithdraw,
  deleteScheduledAt,
  deletionNoticeAt,
  retiredLoginId,
  withdrawDoneMessage,
} from "@/lib/account/withdraw";
import { hashSecret, verifySecret } from "@/lib/auth/hash";
import { toKstDateKey } from "@/lib/time";
import type { Db, RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";
import { SYSTEM, transition } from "@/server/bookings/core";
import { canAdminWithdraw } from "@/server/center/center-service";
import { startDeparture } from "@/server/center/departure-service";
import { queueNotification } from "@/server/notify/notify-service";
import { consumeVerification } from "@/server/auth/sms-service";

const ACTIVE_BOOKINGS = [
  "REQUESTED",
  "PENDING_CONFIRM",
  "CONFIRMED",
  "INSUFFICIENT",
] as const;

/** 탈퇴 전 안내: 남은 이용권·예정 수업 (트레이너는 연결 수강생 수·예정 수업 수) */
export async function withdrawPreview(
  db: Db,
  userId: string,
  now = new Date(),
) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const admin = await canAdminWithdraw(db, userId);
  if (user.role === "STUDENT") {
    const s = await db.student.findUnique({ where: { userId } });
    const passes = s
      ? await db.pass.findMany({
          where: { studentId: s.id, status: { in: ["ACTIVE", "PAUSED"] } },
        })
      : [];
    const upcoming = s
      ? await db.booking.count({
          where: {
            studentId: s.id,
            status: { in: [...ACTIVE_BOOKINGS] },
            startAt: { gt: now },
          },
        })
      : 0;
    return {
      role: user.role,
      remainingPasses: passes.filter(
        (p) => toKstDateKey(p.endDate) >= toKstDateKey(now),
      ).length,
      upcomingBookings: upcoming,
      linkedStudents: 0,
      blockedByCenter: admin.ok ? null : admin.centerName,
    };
  }
  const [linked, upcoming] = await Promise.all([
    db.trainerStudentLink.count({
      where: { trainerId: userId, endedAt: null },
    }),
    db.booking.count({
      where: {
        trainerId: userId,
        status: { in: [...ACTIVE_BOOKINGS] },
        startAt: { gt: now },
      },
    }),
  ]);
  return {
    role: user.role,
    remainingPasses: 0,
    upcomingBookings: upcoming,
    linkedStudents: linked,
    blockedByCenter: admin.ok ? null : admin.centerName,
  };
}

/**
 * 탈퇴 신청 (2.4): 비밀번호 재입력 또는 본인인증.
 * 즉시: 계정 정지, 예정 예약 차감 없이 취소, 연결된 상대방에게 "탈퇴 예정" 알림.
 * 트레이너는 담당 수강생에게 선택 요청(5일, 7.4).
 */
export async function requestWithdraw(
  db: RootDb,
  input: {
    userId: string;
    password?: string;
    verificationId?: string;
    reason?: string;
  },
  now = new Date(),
) {
  const user = await db.user.findUniqueOrThrow({ where: { id: input.userId } });
  if (user.status !== "ACTIVE")
    throw new AppError("INVALID", "이미 탈퇴를 신청했습니다");
  if (input.password) {
    const ok = await verifySecret(input.password, {
      hash: user.passwordHash,
      salt: user.passwordSalt,
    });
    if (!ok) throw new AppError("WRONG_PASSWORD", "비밀번호가 맞지 않습니다");
  } else if (!input.verificationId) {
    throw new AppError("INVALID", "비밀번호를 입력하거나 본인인증을 해 주세요");
  }
  const admin = await canAdminWithdraw(db, user.id);
  if (!admin.ok) {
    throw new AppError(
      "LAST_ADMIN",
      `${admin.centerName}의 마지막 관리자입니다. 다른 관리자를 지정하거나 센터를 해산한 뒤 탈퇴할 수 있습니다`,
    );
  }
  const scheduledAt = deleteScheduledAt(now);
  await db.$transaction(async (tx) => {
    if (!input.password)
      await consumeVerification(
        tx,
        {
          verificationId: input.verificationId!,
          purpose: "WITHDRAW",
          phone: user.phone,
        },
        now,
      );
    await tx.user.update({
      where: { id: user.id },
      data: {
        status: "WITHDRAWING",
        withdrawRequestedAt: now,
        deleteScheduledAt: scheduledAt,
        withdrawReason: input.reason?.trim().slice(0, 300) || null,
      },
    });
    // 예정 예약은 차감 없이 취소 (탈퇴를 취소해도 복구하지 않음)
    const student =
      user.role === "STUDENT"
        ? await tx.student.findUnique({ where: { userId: user.id } })
        : null;
    const bookings = await tx.booking.findMany({
      where: {
        status: { in: [...ACTIVE_BOOKINGS] },
        startAt: { gt: now },
        ...(student ? { studentId: student.id } : { trainerId: user.id }),
      },
    });
    for (const b of bookings) {
      await transition(tx, b, "CANCELED", {
        by: SYSTEM,
        reason: "회원 탈퇴",
        now,
        data: {
          canceledAt: now,
          canceledBy: SYSTEM,
          cancelReason: "회원 탈퇴",
        },
      });
    }
    // 연결된 상대방에게 "탈퇴 예정"
    if (student?.currentTrainerId) {
      await queueNotification(
        tx,
        {
          userId: student.currentTrainerId,
          type: "WITHDRAW_NOTICE",
          title: "탈퇴 예정",
          body: `${user.name}님이 탈퇴를 신청했습니다. ${toKstDateKey(scheduledAt)}에 기록이 삭제됩니다.`,
          url: "/t/students",
        },
        now,
      );
    }
    if (user.role === "TRAINER") {
      await startDeparture(
        tx,
        { trainerId: user.id, type: "WITHDRAW", createdBy: user.id },
        now,
      );
    }
    await queueNotification(
      tx,
      {
        userId: user.id,
        type: "DELETE_TOMORROW",
        title: "계정 삭제 안내",
        body: "내일 계정이 삭제됩니다.",
        url: "/withdraw/cancel",
        scheduledAt: deletionNoticeAt(scheduledAt),
        dedupeKey: `DELETE_TOMORROW:${user.id}:${scheduledAt.toISOString()}`,
      },
      now,
    );
    // 계정 정지: 모든 기기에서 로그아웃
    await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now },
    });
    await writeAuditLog(tx, {
      actor: { type: "USER", id: user.id },
      entity: "User",
      entityId: user.id,
      action: "user.withdrawRequest",
      after: { deleteScheduledAt: scheduledAt },
      at: now,
    });
  });
  return {
    deleteScheduledAt: scheduledAt,
    message: withdrawDoneMessage(scheduledAt),
  };
}

/** 5일 안에 로그인해 탈퇴 취소. 취소된 예약은 복구되지 않는다 */
export async function cancelWithdraw(
  db: RootDb,
  userId: string,
  now = new Date(),
) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!canCancelWithdraw(user.status, user.deleteScheduledAt, now))
    throw new AppError("INVALID", "취소할 탈퇴 신청이 없습니다");
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        status: "ACTIVE",
        withdrawRequestedAt: null,
        deleteScheduledAt: null,
        withdrawReason: null,
      },
    });
    await tx.notification.updateMany({
      where: { userId, type: "DELETE_TOMORROW", status: "SCHEDULED" },
      data: { status: "CANCELED" },
    });
    if (user.role === "TRAINER") {
      const d = await tx.trainerDeparture.findFirst({
        where: { trainerId: userId, type: "WITHDRAW", appliedAt: null },
      });
      if (d) {
        await tx.departureChoice.deleteMany({ where: { departureId: d.id } });
        await tx.trainerDeparture.delete({ where: { id: d.id } });
      }
    }
    await writeAuditLog(tx, {
      actor: { type: "USER", id: userId },
      entity: "User",
      entityId: userId,
      action: "user.withdrawCancel",
      at: now,
    });
  });
}

/** 계정 기록을 지운다: 아이디는 해시로만 남겨 재가입을 막고, 개인정보는 지운다 */
async function scrubUser(tx: Db, userId: string, name: string, now: Date) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const rnd = await hashSecret(randomBytes(32).toString("hex"), 1000);
  await tx.user.update({
    where: { id: userId },
    data: {
      loginId: retiredLoginId(user.loginId),
      name,
      phone: `deleted:${userId}`,
      passwordHash: rnd.hash,
      passwordSalt: rnd.salt,
      prevPasswordHash: null,
      prevPasswordSalt: null,
      gender: null,
      birthDate: null,
      withdrawReason: null,
      status: "DELETED",
    },
  });
  await tx.session.deleteMany({ where: { userId } });
  await tx.pushSubscription.deleteMany({ where: { userId } });
  await tx.notification.deleteMany({ where: { userId } });
  await tx.termsConsent.deleteMany({ where: { userId } });
  await tx.inquiry.deleteMany({ where: { userId } });
  await tx.smsVerification.deleteMany({ where: { phone: user.phone } });
  await tx.linkRequest.deleteMany({
    where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
  });
  // 감사 로그에 남은 이 회원의 개인정보(이름·아이디 등)도 지운다
  await tx.$executeRaw`UPDATE "AuditLog" SET "before" = NULL, "after" = NULL WHERE "entity" = 'User' AND "entityId" = ${userId}`;
  void now;
}

/**
 * 수강생 삭제: 개인정보와 본인 기록(예약 내용, 승인 이력, 메모, 이용권)을 지운다.
 * 트레이너 화면에는 이름 없는 "탈퇴 회원"으로 수업 횟수만 남긴다(수업의 상태·시각·진행 트레이너만).
 */
async function deleteStudent(tx: Db, userId: string, now: Date) {
  const s = await tx.student.findUnique({ where: { userId } });
  if (s) {
    const passIds = (
      await tx.pass.findMany({
        where: { studentId: s.id },
        select: { id: true },
      })
    ).map((p) => p.id);
    const bookingIds = (
      await tx.booking.findMany({
        where: { studentId: s.id },
        select: { id: true },
      })
    ).map((b) => b.id);
    await tx.bookingChangeRequest.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
    await tx.bookingStatusLog.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
    await tx.notification.deleteMany({
      where: { OR: [{ studentId: s.id }, { bookingId: { in: bookingIds } }] },
    });
    await tx.shareLink.deleteMany({
      where: { refId: { in: [...bookingIds, ...passIds] } },
    });
    // 예약은 수업 횟수 집계용 최소 정보만 남긴다
    await tx.booking.updateMany({
      where: { studentId: s.id },
      data: {
        passId: null,
        memo: null,
        cancelRequestReason: null,
        cancelReason: null,
        rejectReason: null,
        disputeStudentReason: null,
        disputeTrainerReason: null,
        approvedAt: null,
        approvalMethod: null,
        approvalRequestedBy: null,
      },
    });
    await tx.ruleConsent.deleteMany({ where: { studentId: s.id } });
    await tx.passPause.deleteMany({ where: { passId: { in: passIds } } });
    await tx.passChangeLog.deleteMany({ where: { passId: { in: passIds } } });
    await tx.pass.deleteMany({ where: { id: { in: passIds } } });
    await tx.trainerStudentLink.updateMany({
      where: { studentId: s.id },
      data: {
        memo: "",
        status: "ENDED",
        endedAt: now,
        endReason: "STUDENT_DELETED",
      },
    });
    await tx.transferRequest.deleteMany({ where: { studentId: s.id } });
    await tx.departureChoice.deleteMany({ where: { studentId: s.id } });
    await tx.student.update({
      where: { id: s.id },
      data: {
        userId: null,
        name: DELETED_STUDENT_NAME,
        phone: "",
        currentTrainerId: null,
      },
    });
    // 상대방 휴대폰 백업에서도 지우도록 (M9 동기화)
    await tx.deletionTombstone.createMany({
      data: [
        { entity: "Student", entityId: s.id },
        ...passIds.map((id) => ({ entity: "Pass", entityId: id })),
      ],
    });
    await tx.auditLog.deleteMany({
      where: {
        entity: { in: ["Pass", "RuleConsent", "PassPause"] },
        entityId: { in: passIds },
      },
    });
  }
  await tx.studentProfile.deleteMany({ where: { userId } });
  await scrubUser(tx, userId, DELETED_STUDENT_NAME, now);
}

/** 트레이너 삭제: 개인정보만 지운다. 수강생 이력의 수업은 남고 이름은 "탈퇴 트레이너" */
async function deleteTrainer(tx: Db, userId: string, now: Date) {
  await tx.trainerProfile.updateMany({
    where: { userId },
    data: {
      workplaceText: null,
      workplaceAddress: null,
      hasCenterAdmin: false,
    },
  });
  await tx.centerMembership.updateMany({
    where: { trainerId: userId, status: { in: ["ACTIVE", "PENDING"] } },
    data: { status: "LEFT", leftAt: now },
  });
  await tx.centerAdmin.deleteMany({ where: { userId } });
  await tx.availabilityRule.deleteMany({ where: { trainerId: userId } });
  await tx.availabilityException.deleteMany({ where: { trainerId: userId } });
  await scrubUser(tx, userId, DELETED_TRAINER_NAME, now);
}

/** 탈퇴 + 5일: 삭제 (1분 작업) */
export async function deleteWithdrawnUsers(db: RootDb, now = new Date()) {
  const due = await db.user.findMany({
    where: { status: "WITHDRAWING", deleteScheduledAt: { lte: now } },
  });
  for (const u of due) {
    await db.$transaction(async (tx) => {
      if (u.role === "STUDENT") await deleteStudent(tx, u.id, now);
      else if (u.role === "TRAINER") await deleteTrainer(tx, u.id, now);
      else {
        await tx.centerAdmin.deleteMany({ where: { userId: u.id } });
        await scrubUser(tx, u.id, "탈퇴 관리자", now);
      }
      await writeAuditLog(tx, {
        actor: { type: "SYSTEM" },
        entity: "User",
        entityId: u.id,
        action: "user.deleted",
        at: now,
      });
    });
  }
  return { usersDeleted: due.length };
}
