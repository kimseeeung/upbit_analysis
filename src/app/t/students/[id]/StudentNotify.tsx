"use client";

import { api } from "@/components/api";
import { Card, Checkbox } from "@/components/ui";
import { NIGHT_NOTICE, quietHoursEnabled } from "@/lib/notify/night";

/** 수강생별 알림 설정 (3.6) */
export function StudentNotify({
  studentId,
  notifyDayBefore,
  notify2h,
  onChanged,
}: {
  studentId: string;
  notifyDayBefore: boolean;
  notify2h: boolean;
  onChanged: () => void;
}) {
  async function set(body: { notifyDayBefore?: boolean; notify2h?: boolean }) {
    const r = await api(`/api/t/students/${studentId}/notify`, {
      method: "PATCH",
      body,
    });
    if (r.ok) onChanged();
  }
  return (
    <Card title="알림 설정">
      <Checkbox
        label="전일 알림 보내기"
        checked={notifyDayBefore}
        onChange={(v) => set({ notifyDayBefore: v })}
      />
      <Checkbox
        label="2시간 전 알림 보내기"
        checked={notify2h}
        onChange={(v) => set({ notify2h: v })}
      />
      {quietHoursEnabled() && (
        <p className="text-muted text-xs">{NIGHT_NOTICE}</p>
      )}
    </Card>
  );
}
