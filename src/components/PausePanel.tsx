"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { Button, Notice, TextField } from "./ui";

interface Pause {
  id: string;
  requestedRole: "TRAINER" | "STUDENT";
  startDate: string;
  endDate: string;
  actualEndDate: string | null;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "ENDED_EARLY" | "CANCELED";
}

const STATUS: Record<Pause["status"], string> = {
  PENDING: "승인 대기",
  APPROVED: "승인",
  REJECTED: "거절",
  ENDED_EARLY: "조기 재개",
  CANCELED: "취소",
};

function todayKst() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

/**
 * 이용권 일시정지 (3.3): 신청·설정, 상대방 승인, 조기 재개.
 * role: 지금 화면을 보는 사람
 */
export function PausePanel({
  passId,
  role,
  onChanged,
}: {
  passId: string;
  role: "TRAINER" | "STUDENT";
  onChanged?: () => void;
}) {
  const [pauses, setPauses] = useState<Pause[]>([]);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(todayKst());
  const [end, setEnd] = useState(todayKst());
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ pauses: Pause[] }>(`/api/passes/${passId}/pauses`);
    if (r.ok) setPauses(r.data.pauses);
  }, [passId]);
  useEffect(() => {
    // 처음 열 때 정지 기록을 불러온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function call(url: string, body: unknown, ok: string) {
    const r = await api(url, { body });
    setMsg(
      r.ok ? { tone: "success", text: ok } : { tone: "error", text: r.message },
    );
    if (r.ok) {
      void load();
      onChanged?.();
    }
  }

  const today = todayKst();
  return (
    <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <p className="text-xs font-medium">일시정지</p>
      {pauses.map((p) => (
        <div
          key={p.id}
          className="flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <span>
            {p.startDate}~
            {p.status === "ENDED_EARLY"
              ? (p.actualEndDate ?? "(쉬지 않음)")
              : p.endDate}{" "}
            · {STATUS[p.status]} · {p.reason}
            {p.status === "PENDING" &&
              ` (${p.requestedRole === "TRAINER" ? "트레이너" : "수강생"} 요청)`}
          </span>
          <span className="flex gap-1">
            {p.status === "PENDING" && p.requestedRole !== role && (
              <>
                <Button
                  variant="secondary"
                  onClick={() =>
                    call(
                      `/api/pauses/${p.id}/respond`,
                      { approve: true },
                      "일시정지를 승인했습니다",
                    )
                  }
                >
                  승인
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    call(
                      `/api/pauses/${p.id}/respond`,
                      { approve: false },
                      "일시정지를 거절했습니다",
                    )
                  }
                >
                  거절
                </Button>
              </>
            )}
            {p.status === "PENDING" && p.requestedRole === role && (
              <Button
                variant="ghost"
                onClick={() =>
                  call(`/api/pauses/${p.id}/cancel`, {}, "요청을 취소했습니다")
                }
              >
                요청 취소
              </Button>
            )}
            {p.status === "APPROVED" && today <= p.endDate && (
              <Button
                variant="ghost"
                onClick={() =>
                  call(
                    `/api/pauses/${p.id}/resume`,
                    {},
                    "일시정지를 끝냈습니다. 실제로 쉰 일수만 연장됩니다",
                  )
                }
              >
                {today < p.startDate ? "정지 취소" : "일찍 재개"}
              </Button>
            )}
          </span>
        </div>
      ))}
      {open ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <TextField
              label="정지 시작일"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
            <TextField
              label="정지 종료일"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <TextField
            label="사유"
            placeholder="부상, 여행, 개인 사정 등"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="text-xs text-zinc-500">
            상대방이 승인하면 적용됩니다. 정지한 일수만큼 만료일이 늘어나고,
            기간 안의 예약은 차감 없이 취소됩니다.
          </p>
          <Button
            disabled={!reason.trim()}
            onClick={async () => {
              await call(
                `/api/passes/${passId}/pauses`,
                { startDate: start, endDate: end, reason },
                "일시정지를 요청했습니다",
              );
              setOpen(false);
            }}
          >
            {role === "TRAINER"
              ? "일시정지 설정 (수강생 승인 필요)"
              : "일시정지 신청"}
          </Button>
        </div>
      ) : (
        <Button variant="ghost" onClick={() => setOpen(true)}>
          {role === "TRAINER" ? "일시정지 설정" : "일시정지 신청"}
        </Button>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
