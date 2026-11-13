import {
  allocateBookings,
  computeAvailableCount,
  summarizePass,
  type BookingForCount,
  type PassForCount,
} from "@/lib/rules/availability";
import { toKstDateKey } from "@/lib/time";
import type { Db } from "@/server/db-types";

/** DB의 이용권·예약을 계산용 입력으로 바꾼다 (한 수강생) */
export async function loadCountInputs(
  db: Db,
  studentId: string,
): Promise<{ passes: PassForCount[]; bookings: BookingForCount[] }> {
  const [passes, bookings] = await Promise.all([
    db.pass.findMany({ where: { studentId } }),
    db.booking.findMany({
      where: {
        studentId,
        OR: [
          { deducted: true },
          {
            status: {
              in: [
                "REQUESTED",
                "PENDING_CONFIRM",
                "CONFIRMED",
                "PENDING_APPROVAL",
                "INSUFFICIENT",
              ],
            },
          },
        ],
      },
      select: {
        id: true,
        startAt: true,
        status: true,
        deducted: true,
        passId: true,
      },
    }),
  ]);
  return {
    // 일시정지 기간은 M6(PassPause)에서 채운다
    passes: passes.map((p) => ({
      id: p.id,
      count: p.count,
      bonusCount: p.bonusCount,
      startDate: toKstDateKey(p.startDate),
      endDate: toKstDateKey(p.endDate),
      status: p.status,
      pauses: [],
      order: p.createdAt.toISOString(),
    })),
    bookings: bookings.map((b) => ({
      id: b.id,
      date: toKstDateKey(b.startAt),
      startAt: b.startAt.toISOString(),
      status: b.status,
      deducted: b.deducted,
      passId: b.passId,
    })),
  };
}

/**
 * 예약 가능 횟수. 잔여·예약 가능 횟수는 화면에서 계산하지 않고 이 함수로만 계산한다.
 * @param date 수업 날짜 (한국 날짜 "YYYY-MM-DD")
 */
export async function getAvailableCount(
  db: Db,
  studentId: string,
  date: string,
  options: { excludeBookingId?: string } = {},
): Promise<number> {
  const { passes, bookings } = await loadCountInputs(db, studentId);
  return computeAvailableCount(passes, bookings, date, options);
}

/** 이용권별 요약(등록·서비스·사용·잔여·예정)과 오늘 기준 예약 가능 횟수 */
export async function getPassSummaries(
  db: Db,
  studentId: string,
  today = toKstDateKey(new Date()),
) {
  const { passes, bookings } = await loadCountInputs(db, studentId);
  const allocation = allocateBookings(passes, bookings);
  return {
    availableToday: computeAvailableCount(passes, bookings, today),
    byPass: Object.fromEntries(
      passes.map((p) => [p.id, summarizePass(p, bookings, allocation)]),
    ),
    overflowBookingIds: allocation.overflow,
  };
}
