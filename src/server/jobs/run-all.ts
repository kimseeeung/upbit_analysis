import type { RootDb } from "@/server/db-types";
import { runApprovalJobs } from "@/server/bookings/approval-service";
import { runBookingJobs } from "@/server/bookings/booking-service";
import { deliverDueNotifications } from "@/server/notify/notify-service";
import { scheduleReminders } from "@/server/notify/reminders";
import { syncPauseStatuses } from "@/server/passes/pause-service";
import { runCenterJobs } from "@/server/center/departure-service";
import { runTransferDeadlines } from "@/server/center/transfer-service";
import { deleteWithdrawnUsers } from "@/server/account/withdraw-service";

/** 1분마다 실행하는 모든 자동 처리 (순서: 상태 변경 → 알림 만들기 → 보내기) */
export async function runAllJobs(db: RootDb, now = new Date()) {
  const bookings = await runBookingJobs(db, now);
  const approvals = await runApprovalJobs(db, now);
  const pauses = await syncPauseStatuses(db, now);
  const center = await runCenterJobs(db, now);
  const transfers = await runTransferDeadlines(db, now);
  // 탈퇴 유예(5일)와 트레이너 탈퇴 선택 기한(5일)이 같으므로 선택을 먼저 적용한 뒤 삭제
  const deletions = await deleteWithdrawnUsers(db, now);
  const reminders = await scheduleReminders(db, now);
  const delivery = await deliverDueNotifications(db, now);
  return {
    ...bookings,
    ...approvals,
    ...pauses,
    ...center,
    ...transfers,
    ...deletions,
    reminders,
    delivery,
  };
}
