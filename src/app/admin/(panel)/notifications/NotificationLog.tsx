"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { fmtDateTime } from "@/components/fmt";

interface Row {
  id: string;
  type: string;
  title: string;
  status: string;
  sendAt: string;
  sentAt: string | null;
  failReason: string | null;
  recipient: string;
}
const STATUS: Record<string, string> = {
  SCHEDULED: "예약",
  SENT: "보냄",
  FAILED: "실패",
  SKIPPED: "보내지 않음",
  CANCELED: "취소",
};

/** 알림 발송 내역 (12.4) */
export function NotificationLog() {
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    void api<{ notifications: Row[] }>(
      `/api/admin/notifications${status ? `?status=${status}` : ""}`,
    ).then((r) => r.ok && setRows(r.data.notifications));
  }, [status]);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">알림 발송 내역</h1>
      <select
        aria-label="상태"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="w-40 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        <option value="">전체</option>
        {Object.entries(STATUS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
              <th className="px-2 py-2">보낼 시각</th>
              <th className="px-2 py-2">받는 사람</th>
              <th className="px-2 py-2">종류</th>
              <th className="px-2 py-2">제목</th>
              <th className="px-2 py-2">상태</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((n) => (
              <tr
                key={n.id}
                className="border-b border-zinc-100 dark:border-zinc-800"
              >
                <td className="px-2 py-2">{fmtDateTime(n.sendAt)}</td>
                <td className="px-2 py-2">{n.recipient}</td>
                <td className="px-2 py-2">{n.type}</td>
                <td className="px-2 py-2">{n.title}</td>
                <td className="px-2 py-2">
                  {STATUS[n.status] ?? n.status}
                  {n.failReason && (
                    <span className="text-xs text-zinc-500">
                      {" "}
                      · {n.failReason}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
