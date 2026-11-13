import type { BookingStatus } from "@/generated/prisma/client";
import { allocateBookings } from "@/lib/rules/availability";
import type { Db } from "@/server/db-types";
import { loadCountInputs } from "@/server/passes/availability-service";
import { SYSTEM, transition } from "./core";

const MARKABLE: BookingStatus[] = ["REQUESTED", "PENDING_CONFIRM", "CONFIRMED"];

/**
 * 잔여 부족 보류·복구 (3.4).
 * 차감·이용권 변경 뒤 호출한다. 이용권에 배정되지 못한 앞으로의 예정 예약은
 * "잔여 부족"으로, 다시 배정되는 잔여 부족 예약은 원래 상태로 되돌린다.
 * 알림(양쪽 즉시)은 M5에서 붙인다.
 */
export async function reconcileInsufficient(
  tx: Db,
  studentId: string,
  now = new Date(),
) {
  const { passes, bookings } = await loadCountInputs(tx, studentId);
  const { overflow } = allocateBookings(passes, bookings);
  const overflowSet = new Set(overflow);
  const rows = await tx.booking.findMany({
    where: {
      studentId,
      status: { in: [...MARKABLE, "INSUFFICIENT"] },
      startAt: { gt: now },
    },
  });
  const marked: string[] = [];
  const restored: string[] = [];
  for (const b of rows) {
    if (b.status !== "INSUFFICIENT" && overflowSet.has(b.id)) {
      await transition(tx, b, "INSUFFICIENT", {
        by: SYSTEM,
        reason: "잔여 횟수 부족",
        now,
        data: { prevStatus: b.status, insufficientAt: now },
      });
      marked.push(b.id);
    } else if (b.status === "INSUFFICIENT" && !overflowSet.has(b.id)) {
      await transition(tx, b, b.prevStatus ?? "CONFIRMED", {
        by: SYSTEM,
        reason: "이용권 추가로 복구",
        now,
        data: { prevStatus: null, insufficientAt: null },
      });
      restored.push(b.id);
    }
  }
  return { marked, restored };
}
