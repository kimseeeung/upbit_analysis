"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { fmtDateTime } from "@/components/fmt";
import { Button, Card, EmptyState, Notice } from "@/components/ui";

interface Conflict {
  id: string;
  kind: string;
  label: string;
  reason: string;
  localChange: Record<string, unknown>;
  serverState: Record<string, unknown> | null;
  deviceLabel: string;
  localAt: string;
}

function describe(v: Record<string, unknown> | null) {
  if (!v) return "-";
  const parts: string[] = [];
  if (typeof v.status === "string") parts.push(`상태 ${v.status}`);
  if (typeof v.startAt === "string") parts.push(fmtDateTime(v.startAt));
  if (typeof v.memo === "string") parts.push(`메모 "${v.memo}"`);
  if (typeof v.reason === "string") parts.push(`사유 ${v.reason}`);
  return parts.join(" · ") || "-";
}

/** 동기화 충돌 (11.3): 서버 기록을 유지했고, 휴대폰 변경을 적용할지 고른다 */
export function SyncConflicts() {
  const [list, setList] = useState<Conflict[] | null>(null);
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const load = useCallback(async () => {
    const r = await api<{ conflicts: Conflict[] }>("/api/t/sync-conflicts");
    if (r.ok) setList(r.data.conflicts);
  }, []);
  useEffect(() => {
    // 처음 열 때 불러온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  async function resolve(id: string, choice: "KEEP_SERVER" | "APPLY_LOCAL") {
    const r = await api(`/api/t/sync-conflicts/${id}`, { body: { choice } });
    setMsg(
      r.ok
        ? {
            tone: "success",
            text:
              choice === "KEEP_SERVER"
                ? "서버 기록을 유지했습니다"
                : "휴대폰 변경을 적용했습니다",
          }
        : { tone: "error", text: r.message },
    );
    void load();
  }
  if (!list) return <p className="text-muted text-sm">불러오는 중…</p>;
  return (
    <div className="flex flex-col gap-3">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {list.length === 0 && (
        <EmptyState icon="check">동기화 충돌이 없습니다. 🎉</EmptyState>
      )}
      {list.map((c) => (
        <Card key={c.id} title={`${c.label} · ${c.deviceLabel}`}>
          <p className="text-sm">{c.reason}</p>
          <p className="text-muted text-xs">
            휴대폰에서 {fmtDateTime(c.localAt)}에 만든 변경:{" "}
            {describe(c.localChange)}
          </p>
          <p className="text-muted text-xs">
            서버 기록: {describe(c.serverState)}
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => resolve(c.id, "KEEP_SERVER")}
            >
              서버 기록 유지
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => resolve(c.id, "APPLY_LOCAL")}
            >
              휴대폰 변경 적용
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
