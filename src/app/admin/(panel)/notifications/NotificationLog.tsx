"use client";

import { Card, FilterBar, PageHeader } from "@/components/ui";

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
      <PageHeader title="알림 발송 내역" />
      <FilterBar>
        <select
          aria-label="상태"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border-line bg-surface w-40 rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">전체</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </FilterBar>
      <Card title="발송 내역" icon="history" count={rows?.length ?? 0}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-line border-b text-left">
                <th className="px-2 py-2">보낼 시각</th>
                <th className="px-2 py-2">받는 사람</th>
                <th className="px-2 py-2">종류</th>
                <th className="px-2 py-2">제목</th>
                <th className="px-2 py-2">상태</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((n) => (
                <tr key={n.id} className="border-line border-b">
                  <td className="px-2 py-2">{fmtDateTime(n.sendAt)}</td>
                  <td className="px-2 py-2">{n.recipient}</td>
                  <td className="px-2 py-2">{n.type}</td>
                  <td className="px-2 py-2">{n.title}</td>
                  <td className="px-2 py-2">
                    {STATUS[n.status] ?? n.status}
                    {n.failReason && (
                      <span className="text-muted text-xs">
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
      </Card>
    </div>
  );
}
