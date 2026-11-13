import type { RootDb } from "@/server/db-types";
import { runApprovalJobs } from "@/server/bookings/approval-service";
import { runBookingJobs } from "@/server/bookings/booking-service";
import { deliverDueNotifications } from "@/server/notify/notify-service";
import { scheduleReminders } from "@/server/notify/reminders";
import { syncPauseStatuses } from "@/server/passes/pause-service";

/** 1분마다 실행하는 모든 자동 처리 (순서: 상태 변경 → 알림 만들기 → 보내기) */
export async function runAllJobs(db: RootDb, now = new Date()) {
  const bookings = await runBookingJobs(db, now);
  const approvals = await runApprovalJobs(db, now);
  const pauses = await syncPauseStatuses(db, now);
  const reminders = await scheduleReminders(db, now);
  const delivery = await deliverDueNotifications(db, now);
  return { ...bookings, ...approvals, ...pauses, reminders, delivery };
}
