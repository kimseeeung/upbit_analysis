/**
 * 예약·승인·규칙 이벤트 알림 (명세 8.2). 상태 전이·생성 지점에서 부른다.
 * 받는 사람이 알림을 받을 수 없고 응답이 필요한 알림은 "직접 보내야 함"으로 표시한다(8.4).
 */

import type { BookingStatus, Prisma } from "@/generated/prisma/client";
import { formatKstMonthDay, toKstTimeString } from "@/lib/time";
import type { Db } from "@/server/db-types";
import { cancelBookingReminders, queueNotification } from "./notify-service";

type BookingRow = Prisma.BookingGetPayload<object>;

const SYSTEM = "SYSTEM";
const when = (d: Date) => `${formatKstMonthDay(d)} ${toKstTimeString(d)}`;

async function parties(db: Db, b: Pick<BookingRow, "studentId" | "trainerId">) {
  const [student, trainer] = await Promise.all([
    db.student.findUniqueOrThrow({
      where: { id: b.studentId },
      select: { id: true, name: true, userId: true },
    }),
    db.user.findUniqueOrThrow({
      where: { id: b.trainerId },
      select: { id: true, name: true },
    }),
  ]);
  return { student, trainer };
}

async function toStudent(
  db: Db,
  b: BookingRow,
  type: string,
  title: string,
  body: string,
  now: Date,
  responseRequired = false,
  url = "/s",
) {
  const { student } = await parties(db, b);
  await queueNotification(
    db,
    {
      userId: student.userId,
      studentId: student.id,
      bookingId: b.id,
      type,
      title,
      body,
      url,
      responseRequired,
    },
    now,
  );
}

async function toTrainer(
  db: Db,
  b: BookingRow,
  type: string,
  title: string,
  body: string,
  now: Date,
  url = "/t",
) {
  await queueNotification(
    db,
    { userId: b.trainerId, bookingId: b.id, type, title, body, url },
    now,
  );
}

export async function onBookingCreated(db: Db, b: BookingRow, now: Date) {
  const { student, trainer } = await parties(db, b);
  if (b.status === "PENDING_CONFIRM") {
    await toStudent(
      db,
      b,
      "CONFIRM_REQUEST",
      "예약 확정 요청",
      `${trainer.name} 트레이너가 ${when(b.startAt)} 수업을 등록했습니다. 수락해 주세요.`,
      now,
      true,
      "/s/requests",
    );
  } else if (b.status === "REQUESTED") {
    await toTrainer(
      db,
      b,
      "BOOKING_REQUEST",
      "예약 신청 도착",
      `${student.name}님이 ${when(b.startAt)} 수업을 신청했습니다.`,
      now,
      "/t/requests",
    );
  }
}

/** 상태가 바뀔 때 (core.transition에서 호출) */
export async function onBookingTransition(
  db: Db,
  b: BookingRow,
  from: BookingStatus,
  to: BookingStatus,
  by: string,
  now: Date,
  extra: {
    deducted?: boolean;
    skippedReason?: string | null;
    ruleText?: string | null;
    reason?: string | null;
  } = {},
) {
  const { student, trainer } = await parties(db, b);
  const t = when(b.startAt);
  if (
    [
      "CANCELED",
      "REJECTED",
      "EXPIRED",
      "NO_SHOW",
      "COMPLETED",
      "INSUFFICIENT",
    ].includes(to)
  ) {
    await cancelBookingReminders(db, b.id);
  }
  switch (to) {
    case "CONFIRMED":
      if (from === "REQUESTED") {
        await toStudent(
          db,
          b,
          "REQUEST_RESULT",
          "예약 신청 수락",
          `${t} 수업 신청이 수락되었습니다.`,
          now,
        );
      } else if (from === "PENDING_CONFIRM") {
        await toTrainer(
          db,
          b,
          "CONFIRM_RESULT",
          by === SYSTEM ? "예약 자동 확정" : "예약 수락",
          by === SYSTEM
            ? `${student.name}님의 ${t} 수업이 응답이 없어 자동 확정되었습니다.`
            : `${student.name}님이 ${t} 수업을 수락했습니다.`,
          now,
        );
      } else if (from === "INSUFFICIENT") {
        await toStudent(
          db,
          b,
          "INSUFFICIENT_RESTORED",
          "예약 다시 확정",
          `이용권이 추가되어 ${t} 예약이 다시 확정되었습니다.`,
          now,
        );
        await toTrainer(
          db,
          b,
          "INSUFFICIENT_RESTORED",
          "예약 다시 확정",
          `${student.name}님의 ${t} 예약이 다시 확정되었습니다.`,
          now,
        );
      }
      break;
    case "REJECTED":
      if (from === "REQUESTED") {
        await toStudent(
          db,
          b,
          "REQUEST_RESULT",
          "예약 신청 거절",
          `${t} 수업 신청이 거절되었습니다.${b.rejectReason ? ` 사유: ${b.rejectReason}` : ""}`,
          now,
        );
      } else {
        await toTrainer(
          db,
          b,
          "CONFIRM_RESULT",
          "예약 거절",
          `${student.name}님이 ${t} 수업을 거절했습니다.${b.rejectReason ? ` 사유: ${b.rejectReason}` : ""}`,
          now,
        );
      }
      break;
    case "EXPIRED":
      await toStudent(
        db,
        b,
        "REQUEST_RESULT",
        "예약 신청 만료",
        `${t} 수업 신청이 트레이너 응답이 없어 만료되었습니다.`,
        now,
      );
      break;
    case "INSUFFICIENT": {
      const text = `잔여 횟수가 부족해 ${formatKstMonthDay(b.startAt)} 예약을 진행할 수 없습니다. 이용권을 추가하면 다시 확정됩니다.`;
      await toStudent(db, b, "INSUFFICIENT_HOLD", "잔여 부족", text, now);
      await toTrainer(
        db,
        b,
        "INSUFFICIENT_HOLD",
        "잔여 부족",
        `${student.name}님: ${text}`,
        now,
      );
      break;
    }
    case "CANCELED": {
      const deduct = extra.deducted
        ? ` 당일 취소로 1회 차감되었습니다 (${extra.ruleText ?? "수강 규칙"}).`
        : extra.skippedReason === "NO_CONSENT"
          ? " 당일 취소지만 미동의로 차감하지 않았습니다."
          : "";
      if (from === "INSUFFICIENT") {
        await toStudent(
          db,
          b,
          "INSUFFICIENT_CANCELED",
          "예약 취소",
          `잔여 횟수 부족이 해결되지 않아 ${t} 예약이 차감 없이 취소되었습니다.`,
          now,
        );
        await toTrainer(
          db,
          b,
          "INSUFFICIENT_CANCELED",
          "예약 취소",
          `${student.name}님의 ${t} 예약이 잔여 부족으로 취소되었습니다.`,
          now,
        );
      } else if (by === b.trainerId) {
        if (b.cancelRequestedAt) {
          await toStudent(
            db,
            b,
            "CANCEL_RESULT",
            "취소 요청 수락",
            `${t} 수업 취소 요청이 수락되었습니다.${deduct}`,
            now,
          );
        } else {
          await toStudent(
            db,
            b,
            "CANCELED_BY_TRAINER",
            "예약 취소",
            `${trainer.name} 트레이너가 ${t} 수업을 취소했습니다.`,
            now,
          );
        }
      } else if (by === SYSTEM) {
        await toStudent(
          db,
          b,
          "CANCEL_RESULT",
          "예약 취소",
          `${t} 수업이 취소되었습니다.${deduct}`,
          now,
        );
        await toTrainer(
          db,
          b,
          "CANCEL_RESULT",
          "예약 취소",
          `${student.name}님의 ${t} 수업이 자동 취소되었습니다.`,
          now,
        );
      } else {
        await toTrainer(
          db,
          b,
          "CANCELED_BY_STUDENT",
          "신청 철회",
          `${student.name}님이 ${t} 수업 신청을 철회했습니다.`,
          now,
        );
      }
      if (extra.deducted) {
        await toStudent(
          db,
          b,
          "DEDUCTION",
          "당일 취소 차감",
          `${t} 수업 당일 취소로 1회 차감되었습니다. 적용 규칙: ${extra.ruleText ?? ""}`,
          now,
        );
      }
      break;
    }
    case "PENDING_APPROVAL":
      await toStudent(
        db,
        b,
        "APPROVAL_REQUEST",
        "수업 완료 승인 요청",
        `${t} 수업이 끝났습니다. PIN을 입력해 완료를 승인해 주세요.`,
        now,
        true,
        "/s/requests",
      );
      break;
    case "COMPLETED":
      await toTrainer(
        db,
        b,
        "APPROVAL_RESULT",
        "수업 완료",
        `${student.name}님의 ${t} 수업이 완료 처리되었습니다.`,
        now,
      );
      break;
    case "NO_SHOW":
      await toStudent(
        db,
        b,
        "DEDUCTION",
        "노쇼 처리",
        extra.deducted
          ? `${t} 수업이 노쇼로 처리되어 1회 차감되었습니다. 적용 규칙: ${extra.ruleText ?? ""}`
          : extra.skippedReason === "NO_CONSENT"
            ? `${t} 수업이 노쇼로 기록되었습니다 (규칙 미동의로 차감 안 함).`
            : `${t} 수업이 노쇼로 기록되었습니다.`,
        now,
        false,
      );
      break;
  }
}

/** 변경 요청·제안·취소 요청·이의 같은 상태 외 이벤트 */
export async function onBookingEvent(
  db: Db,
  b: BookingRow,
  kind:
    | "CHANGE_REQUEST"
    | "CHANGE_RESULT"
    | "PROPOSAL"
    | "CANCEL_REQUEST"
    | "CANCEL_REJECTED"
    | "DISPUTE"
    | "DISPUTE_RESULT",
  input: { by: string; text?: string },
  now: Date,
) {
  const { student } = await parties(db, b);
  const t = when(b.startAt);
  const byTrainer = input.by === b.trainerId;
  switch (kind) {
    case "CHANGE_REQUEST":
      if (byTrainer)
        await toStudent(
          db,
          b,
          "CHANGE_REQUEST",
          "시간 변경 요청",
          `${t} 수업의 시간 변경 요청이 왔습니다.`,
          now,
          true,
        );
      else
        await toTrainer(
          db,
          b,
          "CHANGE_REQUEST",
          "시간 변경 요청",
          `${student.name}님이 ${t} 수업의 시간 변경을 요청했습니다.`,
          now,
          "/t/requests",
        );
      break;
    case "CHANGE_RESULT":
      if (byTrainer)
        await toStudent(
          db,
          b,
          "CHANGE_RESULT",
          "변경 요청 응답",
          `${t} 수업 변경 요청: ${input.text ?? ""}`,
          now,
        );
      else
        await toTrainer(
          db,
          b,
          "CHANGE_RESULT",
          "변경 요청 응답",
          `${student.name}님 ${t} 수업 변경 요청: ${input.text ?? ""}`,
          now,
        );
      break;
    case "PROPOSAL":
      await toTrainer(
        db,
        b,
        "PROPOSAL",
        "다른 시간 제안",
        `${student.name}님이 ${t} 수업에 다른 시간을 제안했습니다.`,
        now,
        "/t/requests",
      );
      break;
    case "CANCEL_REQUEST":
      await toTrainer(
        db,
        b,
        "CANCEL_REQUEST",
        "취소 요청",
        `${student.name}님이 ${t} 수업 취소를 요청했습니다.`,
        now,
        "/t/requests",
      );
      break;
    case "CANCEL_REJECTED":
      await toStudent(
        db,
        b,
        "CANCEL_RESULT",
        "취소 요청 거절",
        `${t} 수업 취소 요청이 거절되어 예약이 유지됩니다.${input.text ? ` 사유: ${input.text}` : ""}`,
        now,
      );
      break;
    case "DISPUTE":
      await toTrainer(
        db,
        b,
        "DISPUTE",
        "이의 제기",
        `${student.name}님이 ${t} 수업에 이의를 제기했습니다.`,
        now,
        "/t/requests",
      );
      break;
    case "DISPUTE_RESULT":
      await toStudent(
        db,
        b,
        "DISPUTE_RESULT",
        "이의 처리 결과",
        `${t} 수업 이의 처리: ${input.text ?? ""}`,
        now,
      );
      break;
  }
}
