import { writeAuditLog } from "@/lib/audit";
import type { RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";
import { assertTrainerStudent } from "@/server/students/access";

export interface NotifyFlags {
  notifyDayBefore?: boolean;
  notify2h?: boolean;
}

/** 수강생별 알림 설정 (3.6): 여러 명 일괄 변경 가능 */
export async function setStudentNotify(
  db: RootDb,
  trainerId: string,
  studentIds: string[],
  flags: NotifyFlags,
  now = new Date(),
) {
  if (studentIds.length === 0 || studentIds.length > 200)
    throw new AppError("INVALID", "수강생을 골라 주세요");
  const data: NotifyFlags = {};
  if (typeof flags.notifyDayBefore === "boolean")
    data.notifyDayBefore = flags.notifyDayBefore;
  if (typeof flags.notify2h === "boolean") data.notify2h = flags.notify2h;
  await db.$transaction(async (tx) => {
    for (const id of studentIds) {
      const link = await assertTrainerStudent(tx, trainerId, id);
      await tx.trainerStudentLink.update({ where: { id: link.id }, data });
      await writeAuditLog(tx, {
        actor: { type: "USER", id: trainerId },
        entity: "TrainerStudentLink",
        entityId: link.id,
        action: "notify.studentSettings",
        before: {
          notifyDayBefore: link.notifyDayBefore,
          notify2h: link.notify2h,
        },
        after: data,
        at: now,
      });
    }
  });
}

/** 예약 하나만 예외로 끄기 */
export async function setBookingNotify(
  db: RootDb,
  trainerId: string,
  bookingId: string,
  flags: { dayBeforeOff?: boolean; twoHoursOff?: boolean },
) {
  const b = await db.booking.findUnique({ where: { id: bookingId } });
  if (!b || b.trainerId !== trainerId)
    throw new AppError("NOT_FOUND", "예약을 찾을 수 없습니다", 404);
  await assertTrainerStudent(db, trainerId, b.studentId);
  await db.booking.update({
    where: { id: bookingId },
    data: {
      ...(typeof flags.dayBeforeOff === "boolean"
        ? { notifyDayBeforeOff: flags.dayBeforeOff }
        : {}),
      ...(typeof flags.twoHoursOff === "boolean"
        ? { notify2hOff: flags.twoHoursOff }
        : {}),
    },
  });
  // 끈 알림은 예약해 둔 것도 취소
  const types = [
    flags.dayBeforeOff ? "DAY_BEFORE" : null,
    flags.twoHoursOff ? "TWO_HOURS" : null,
  ].filter(Boolean) as string[];
  if (types.length) {
    await db.notification.updateMany({
      where: { bookingId, type: { in: types }, status: "SCHEDULED" },
      data: { status: "CANCELED", failReason: "TURNED_OFF" },
    });
  }
}
