"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { Card, Notice } from "@/components/ui";
import { DAY_BEFORE_TIME_OPTIONS, NIGHT_NOTICE } from "@/lib/notify/night";

/** 전일 알림 시각 (3.6, 08:00~21:00 사이만) + 야간 주석 */
export function NotifySettings() {
  const [time, setTime] = useState<string | null>(null);
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  useEffect(() => {
    api<{ dayBeforeNotifyTime: string }>("/api/t/settings/notify").then(
      (r) => r.ok && setTime(r.data.dayBeforeNotifyTime),
    );
  }, []);
  async function save(t: string) {
    setTime(t);
    const r = await api("/api/t/settings/notify", {
      method: "PATCH",
      body: { dayBeforeNotifyTime: t },
    });
    setMsg(
      r.ok
        ? { tone: "success", text: "저장했습니다" }
        : { tone: "error", text: r.message },
    );
  }
  return (
    <Card title="알림">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">전일 수업 알림 시각</span>
        <select
          aria-label="전일 수업 알림 시각"
          value={time ?? "20:00"}
          onChange={(e) => save(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {DAY_BEFORE_TIME_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-zinc-500">
        수업 전날 이 시각에 수강생에게 알림을 보냅니다. 수강생별 끄기는 수강생
        상세에서 합니다.
      </p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <p className="text-xs text-zinc-500">{NIGHT_NOTICE}</p>
    </Card>
  );
}
