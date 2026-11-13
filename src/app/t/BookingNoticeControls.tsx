"use client";

import { useState } from "react";
import { api } from "@/components/api";
import { fmtDateTime } from "@/components/fmt";
import { KakaoShareButton } from "@/components/KakaoShareButton";
import { Checkbox, Button } from "@/components/ui";

export interface BookingNotice {
  dayBefore: "OFF" | "SCHEDULED" | "SENT" | "CONFIRMED" | "FAILED" | null;
  dayBeforeSendAt: string | null;
  dayBeforeSentAt: string | null;
  dayBeforeConfirmedAt: string | null;
  twoHours: string | null;
  twoHoursSentAt: string | null;
  manualShare: boolean;
  dayBeforeOff: boolean;
  twoHoursOff: boolean;
}

export const NOTICE_ICON: Record<
  NonNullable<BookingNotice["dayBefore"]>,
  { icon: string; label: string; cls: string }
> = {
  SCHEDULED: {
    icon: "🔔",
    label: "전일 알림 발송 예정",
    cls: "bg-zinc-200 text-zinc-600 grayscale",
  },
  SENT: {
    icon: "🔔",
    label: "보냈지만 미확인",
    cls: "bg-blue-100 text-blue-700",
  },
  CONFIRMED: {
    icon: "✓",
    label: "수강생이 확인",
    cls: "bg-green-100 text-green-700",
  },
  FAILED: { icon: "!", label: "보내지 못함", cls: "bg-red-100 text-red-700" },
  OFF: { icon: "🔕", label: "알림 꺼짐", cls: "bg-zinc-100 text-zinc-500" },
};

/** 예약 상세의 알림 상태·예외 끄기·다시 보내기·카톡 보내기 (4.2, 4.8, 8.4) */
export function BookingNoticeControls({
  bookingId,
  status,
  notice,
  onChanged,
}: {
  bookingId: string;
  status: string;
  notice: BookingNotice | null;
  onChanged: (message?: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const active = status === "CONFIRMED" || status === "PENDING_CONFIRM";

  async function toggle(body: {
    dayBeforeOff?: boolean;
    twoHoursOff?: boolean;
  }) {
    const r = await api(`/api/t/bookings/${bookingId}/notify`, {
      method: "PATCH",
      body,
    });
    if (r.ok) onChanged("알림 설정을 바꿨습니다");
    else setError(r.message);
  }
  async function resend() {
    const r = await api<{ sendAt: string; needsManualShare: boolean }>(
      `/api/t/bookings/${bookingId}/resend`,
      { body: {} },
    );
    if (r.ok)
      onChanged(
        r.data.needsManualShare
          ? "알림을 받을 수 없는 수강생입니다. 카톡으로 보내 주세요"
          : `${fmtDateTime(r.data.sendAt)}에 다시 보냅니다`,
      );
    else setError(r.message);
  }

  const icon = notice?.dayBefore ? NOTICE_ICON[notice.dayBefore] : null;
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800/50">
      <p className="font-medium">알림</p>
      {icon && (
        <p>
          <span className={`mr-1 rounded px-1.5 ${icon.cls}`}>{icon.icon}</span>
          전일 알림: {icon.label}
          {notice?.dayBeforeSentAt &&
            ` · 보냄 ${fmtDateTime(notice.dayBeforeSentAt)}`}
          {notice?.dayBeforeConfirmedAt &&
            ` · 확인 ${fmtDateTime(notice.dayBeforeConfirmedAt)}`}
          {notice?.dayBefore === "SCHEDULED" &&
            notice.dayBeforeSendAt &&
            ` · ${fmtDateTime(notice.dayBeforeSendAt)} 예정`}
        </p>
      )}
      {notice?.twoHours && (
        <p className="text-xs text-zinc-500">
          2시간 전 알림:{" "}
          {notice.twoHours === "SENT"
            ? `보냄 ${notice.twoHoursSentAt ? fmtDateTime(notice.twoHoursSentAt) : ""}`
            : notice.twoHours === "SKIPPED"
              ? "생략 (야간)"
              : notice.twoHours === "OFF"
                ? "꺼짐"
                : notice.twoHours === "SCHEDULED"
                  ? "예정"
                  : notice.twoHours}
        </p>
      )}
      {notice?.manualShare && (
        <p className="text-xs text-amber-700">
          📨 알림을 받을 수 없는 수강생입니다. 직접 보내야 합니다.
        </p>
      )}
      {active && (
        <>
          <Checkbox
            label="이 예약만 전일 알림 끄기"
            checked={!!notice?.dayBeforeOff}
            onChange={(v) => toggle({ dayBeforeOff: v })}
          />
          <Checkbox
            label="이 예약만 2시간 전 알림 끄기"
            checked={!!notice?.twoHoursOff}
            onChange={(v) => toggle({ twoHoursOff: v })}
          />
          <Button variant="ghost" onClick={resend}>
            다시 보내기
          </Button>
        </>
      )}
      {status === "PENDING_CONFIRM" && (
        <KakaoShareButton purpose="CONFIRM_BOOKING" refId={bookingId} />
      )}
      {status === "PENDING_APPROVAL" && (
        <KakaoShareButton
          purpose="APPROVE"
          refId={bookingId}
          label="카톡으로 승인 요청 보내기"
        />
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
