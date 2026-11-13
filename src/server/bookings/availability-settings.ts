import { writeAuditLog } from "@/lib/audit";
import { isValidTime } from "@/lib/booking/schedule";
import { parseKstDateKey, toKstDateKey } from "@/lib/time";
import type { Db, RootDb } from "@/server/db-types";
import { AppError } from "@/server/errors";

export interface AvailabilityInput {
  rules: { weekday: number; startTime: string; endTime: string }[];
  exceptions: {
    date: string;
    isOff: boolean;
    startTime?: string | null;
    endTime?: string | null;
  }[];
}

export async function getAvailability(db: Db, trainerId: string) {
  const [rules, exceptions] = await Promise.all([
    db.availabilityRule.findMany({
      where: { trainerId },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    }),
    db.availabilityException.findMany({
      where: { trainerId },
      orderBy: { date: "asc" },
    }),
  ]);
  return {
    rules: rules.map((r) => ({
      weekday: r.weekday,
      startTime: r.startTime,
      endTime: r.endTime,
    })),
    exceptions: exceptions.map((e) => ({
      date: toKstDateKey(e.date),
      isOff: e.isOff,
      startTime: e.startTime,
      endTime: e.endTime,
    })),
  };
}

function checkRange(start: string, end: string) {
  if (!isValidTime(start) || !isValidTime(end))
    throw new AppError("INVALID", "시각은 HH:mm 형식이어야 합니다");
  if (start >= end)
    throw new AppError("INVALID", "끝나는 시각은 시작 시각보다 늦어야 합니다");
}

/** 근무 가능 시간 저장 (요일별 시간대 + 휴무일·예외일, 4.3). 통째로 바꾼다 */
export async function saveAvailability(
  db: RootDb,
  trainerId: string,
  input: AvailabilityInput,
  now = new Date(),
) {
  for (const r of input.rules) {
    if (!Number.isInteger(r.weekday) || r.weekday < 0 || r.weekday > 6)
      throw new AppError("INVALID", "요일을 확인해 주세요");
    checkRange(r.startTime, r.endTime);
  }
  for (let wd = 0; wd < 7; wd++) {
    const day = input.rules
      .filter((r) => r.weekday === wd)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < day.length; i++) {
      if (day[i].startTime < day[i - 1].endTime)
        throw new AppError("INVALID", "같은 요일의 시간대가 겹칩니다");
    }
  }
  const seen = new Set<string>();
  for (const e of input.exceptions) {
    try {
      parseKstDateKey(e.date);
    } catch {
      throw new AppError("INVALID", "예외일 날짜를 확인해 주세요");
    }
    if (seen.has(e.date))
      throw new AppError("INVALID", "같은 예외일이 두 번 있습니다");
    seen.add(e.date);
    if (!e.isOff) checkRange(e.startTime ?? "", e.endTime ?? "");
  }
  await db.$transaction(async (tx) => {
    const before = await getAvailability(tx, trainerId);
    await tx.availabilityRule.deleteMany({ where: { trainerId } });
    await tx.availabilityException.deleteMany({ where: { trainerId } });
    if (input.rules.length) {
      await tx.availabilityRule.createMany({
        data: input.rules.map((r) => ({ ...r, trainerId })),
      });
    }
    if (input.exceptions.length) {
      await tx.availabilityException.createMany({
        data: input.exceptions.map((e) => ({
          trainerId,
          date: parseKstDateKey(e.date),
          isOff: e.isOff,
          startTime: e.isOff ? null : e.startTime,
          endTime: e.isOff ? null : e.endTime,
        })),
      });
    }
    await writeAuditLog(tx, {
      actor: { type: "USER", id: trainerId },
      entity: "Availability",
      entityId: trainerId,
      action: "availability.save",
      before,
      after: input,
      at: now,
    });
  });
}
