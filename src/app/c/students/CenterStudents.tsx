"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { Button, Card, Notice, TextField } from "@/components/ui";

interface Data {
  members: { id: string; name: string }[];
  students: {
    studentId: string;
    name: string;
    phoneMasked: string | null;
    trainerId: string | null;
    trainerName: string | null;
    passCount: number;
    suspendedPasses: number;
    transfer: {
      id: string;
      status: string;
      passTransfer: string;
      fromTrainerId: string | null;
      toTrainerId: string;
    } | null;
  }[];
}

const TRANSFER_STATUS: Record<string, string> = {
  PENDING_TRAINER: "새 트레이너 수락 대기",
  PENDING_STUDENT: "수강생 동의 대기",
  COMPLETED: "변경 완료",
};

/** 수강생 관리 (9.3): 센터 전체 수강생, 담당 변경, 이용권 이동 승인 */
export function CenterStudents() {
  const [d, setD] = useState<Data | null>(null);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const load = useCallback(async () => {
    const r = await api<Data>("/api/c/students");
    if (r.ok) setD(r.data);
    else setMsg({ tone: "error", text: r.message });
  }, []);
  useEffect(() => {
    // 처음 열 때 불러온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  async function post(url: string, body: unknown, ok: string) {
    const r = await api(url, { body });
    setMsg(
      r.ok ? { tone: "success", text: ok } : { tone: "error", text: r.message },
    );
    if (r.ok) void load();
  }
  if (!d)
    return msg ? (
      <Notice tone={msg.tone}>{msg.text}</Notice>
    ) : (
      <p className="text-sm text-zinc-500">불러오는 중…</p>
    );
  const list = d.students.filter((s) => s.name.includes(q.trim()));
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">수강생 관리</h1>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <TextField
        label="이름 검색"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {list.length === 0 && (
        <p className="text-sm text-zinc-500">수강생이 없습니다.</p>
      )}
      {list.map((s) => (
        <Card key={s.studentId} title={s.name}>
          <p className="text-sm">
            담당:{" "}
            {s.trainerName ?? (
              <span className="text-amber-700">담당 트레이너 없음</span>
            )}{" "}
            · 연락처 {s.phoneMasked ?? "가림"} · 이용권 {s.passCount}개
            {s.suspendedPasses > 0 && (
              <span className="text-amber-700">
                {" "}
                (사용 중지 {s.suspendedPasses})
              </span>
            )}
          </p>
          {s.transfer && (
            <p className="text-xs text-zinc-500">
              담당 변경:{" "}
              {TRANSFER_STATUS[s.transfer.status] ?? s.transfer.status} · 이용권
              넘기기:{" "}
              {s.transfer.passTransfer === "PENDING"
                ? "대기"
                : s.transfer.passTransfer}
            </p>
          )}
          {s.transfer?.passTransfer === "PENDING" && (
            <Button
              variant="secondary"
              onClick={() =>
                post(
                  `/api/c/transfers/${s.transfer!.id}/approve-pass`,
                  {},
                  "남은 이용권 이동을 승인했습니다",
                )
              }
            >
              남은 이용권 이동 승인
            </Button>
          )}
          {!s.transfer || s.transfer.status === "COMPLETED" ? (
            <div className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span>새 담당 트레이너</span>
                <select
                  aria-label={`${s.name} 새 담당 트레이너`}
                  value={target[s.studentId] ?? ""}
                  onChange={(e) =>
                    setTarget((t) => ({ ...t, [s.studentId]: e.target.value }))
                  }
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">선택</option>
                  {d.members
                    .filter((m) => m.id !== s.trainerId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </label>
              <Button
                variant="secondary"
                disabled={!target[s.studentId]}
                onClick={() =>
                  post(
                    `/api/c/students/${s.studentId}/transfer`,
                    { toTrainerId: target[s.studentId] },
                    "담당 변경을 요청했습니다 (새 트레이너 수락 → 수강생 동의)",
                  )
                }
              >
                담당 변경
              </Button>
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
