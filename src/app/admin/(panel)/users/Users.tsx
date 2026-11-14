"use client";

import { useState } from "react";
import { api } from "@/components/api";
import { fmtDateTime } from "@/components/fmt";
import { Button, Card, Notice, TextField } from "@/components/ui";

interface Row {
  id: string;
  name: string;
  loginId: string;
  phone: string;
  role: string;
  status: string;
  suspended: boolean;
}
interface Detail {
  id: string;
  name: string;
  loginId: string;
  phone: string;
  role: string;
  status: string;
  createdAt: string;
  suspendedAt: string | null;
  suspendReason: string | null;
  sessions: { deviceLabel: string; lastSeenAt: string }[];
  accessLogs: { operatorName: string; action: string; at: string }[];
}
const ROLE: Record<string, string> = {
  TRAINER: "트레이너",
  STUDENT: "수강생",
  CENTER_ADMIN: "센터 관리자",
};
const ACTION: Record<string, string> = {
  VIEW: "조회",
  SUSPEND: "정지",
  UNSUSPEND: "정지 해제",
};

/** 회원 조회·정지 (12.4). 상세를 열 때마다 조회 기록이 남는다 */
export function Users() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const r = await api<{ users: Row[] }>(
      `/api/admin/users?q=${encodeURIComponent(q)}`,
    );
    if (r.ok) setRows(r.data.users);
  }
  async function open(id: string, keepMessage = false) {
    if (!keepMessage) setMsg(null);
    const r = await api<{ user: Detail }>(`/api/admin/users/${id}`);
    if (r.ok) setDetail(r.data.user);
    else setMsg({ tone: "error", text: r.message });
  }
  async function suspend(on: boolean) {
    if (!detail) return;
    const r = await api(`/api/admin/users/${detail.id}`, {
      body: { suspend: on, reason },
    });
    if (!r.ok) return setMsg({ tone: "error", text: r.message });
    setMsg({
      tone: "success",
      text: on ? "정지했습니다" : "정지를 해제했습니다",
    });
    setReason("");
    void open(detail.id, true);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">회원 조회</h1>
      <form onSubmit={search} className="flex items-end gap-2">
        <TextField
          className="flex-1"
          label="이름·아이디·전화번호 뒷자리"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit" disabled={q.trim().length < 2}>
          검색
        </Button>
      </form>
      {rows && (
        <ul className="divide-line flex flex-col divide-y text-sm">
          {rows.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="w-full py-2 text-left"
                onClick={() => open(u.id)}
              >
                {u.name} · {ROLE[u.role]} · {u.loginId} · {u.phone}
                {u.suspended && (
                  <span className="ml-1 text-rose-600">정지</span>
                )}
                {u.status === "WITHDRAWING" && (
                  <span className="text-muted ml-1">탈퇴 신청</span>
                )}
              </button>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="text-muted py-2">검색 결과가 없습니다</li>
          )}
        </ul>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {detail && (
        <Card title={`${detail.name} (${ROLE[detail.role]})`}>
          <dl className="grid grid-cols-[6rem_1fr] gap-1 text-sm">
            <dt className="text-muted">아이디</dt>
            <dd>{detail.loginId}</dd>
            <dt className="text-muted">전화번호</dt>
            <dd>{detail.phone}</dd>
            <dt className="text-muted">가입일</dt>
            <dd>{fmtDateTime(detail.createdAt)}</dd>
            <dt className="text-muted">상태</dt>
            <dd>
              {detail.suspendedAt
                ? `정지 (${fmtDateTime(detail.suspendedAt)}, ${detail.suspendReason ?? ""})`
                : detail.status === "WITHDRAWING"
                  ? "탈퇴 신청"
                  : "정상"}
            </dd>
            <dt className="text-muted">로그인 기기</dt>
            <dd>
              {detail.sessions.map((s) => s.deviceLabel).join(", ") || "-"}
            </dd>
          </dl>
          {detail.suspendedAt ? (
            <Button variant="secondary" onClick={() => suspend(false)}>
              정지 해제
            </Button>
          ) : (
            <div className="flex items-end gap-2">
              <TextField
                className="flex-1"
                label="정지 사유"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                variant="danger"
                disabled={reason.trim().length < 2}
                onClick={() => suspend(true)}
              >
                정지
              </Button>
            </div>
          )}
          <div>
            <p className="text-sm font-medium">조회 기록</p>
            <ul className="text-muted text-xs">
              {detail.accessLogs.map((l, i) => (
                <li key={i}>
                  {fmtDateTime(l.at)} · {l.operatorName} ·{" "}
                  {ACTION[l.action] ?? l.action}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </div>
  );
}
