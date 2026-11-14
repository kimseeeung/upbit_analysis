"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { fmtDateTime } from "@/components/fmt";
import {
  Button,
  Card,
  Loading,
  Notice,
  PageHeader,
  TextField,
} from "@/components/ui";

interface Op {
  id: string;
  name: string;
  loginId: string | null;
  phone: string;
  status: "INVITED" | "ACTIVE" | "DISABLED";
  invitedByName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}
interface Alert {
  id: string;
  message: string;
  createdAt: string;
  readAt: string | null;
}
const STATUS = { INVITED: "초대 대기", ACTIVE: "활성", DISABLED: "비활성" };

/** 관리자 관리 (12.2) */
export function Operators() {
  const [data, setData] = useState<{
    me: string;
    operators: Op[];
    alerts: Alert[];
  } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ me: string; operators: Op[]; alerts: Alert[] }>(
      "/api/admin/operators",
    );
    if (r.ok) setData(r.data);
  }, []);
  useEffect(() => {
    // 처음 열 때 불러오고 알림을 읽음으로 표시
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().then(() => api("/api/admin/alerts/read", { body: {} }));
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const r = await api<{ inviteUrl: string }>("/api/admin/operators", {
      body: { name, phone },
    });
    if (!r.ok) return setMsg({ tone: "error", text: r.message });
    setInviteUrl(r.data.inviteUrl);
    setName("");
    setPhone("");
    void load();
  }
  async function disable(o: Op) {
    if (
      !confirm(
        `${o.name}님을 ${o.status === "INVITED" ? "초대 취소" : "비활성화"}할까요?`,
      )
    )
      return;
    const r = await api(`/api/admin/operators/${o.id}/disable`, { body: {} });
    setMsg(
      r.ok
        ? { tone: "success", text: "처리했습니다" }
        : { tone: "error", text: r.message },
    );
    void load();
  }

  if (!data) return <Loading />;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="관리자" />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Card title="관리자 목록" icon="users" count={data.operators.length}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-line border-b text-left">
                <th className="px-2 py-2">이름</th>
                <th className="px-2 py-2">아이디</th>
                <th className="px-2 py-2">상태</th>
                <th className="px-2 py-2">추가한 사람</th>
                <th className="px-2 py-2">추가일</th>
                <th className="px-2 py-2">마지막 로그인</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.operators.map((o) => (
                <tr
                  key={o.id}
                  data-operator={o.name}
                  className="border-line border-b"
                >
                  <td className="px-2 py-2">
                    {o.name}
                    {o.id === data.me && (
                      <span className="text-muted ml-1 text-xs">(나)</span>
                    )}
                  </td>
                  <td className="px-2 py-2">{o.loginId ?? "-"}</td>
                  <td className="px-2 py-2">{STATUS[o.status]}</td>
                  <td className="px-2 py-2">
                    {o.invitedByName ?? "환경 변수"}
                  </td>
                  <td className="px-2 py-2">{fmtDateTime(o.createdAt)}</td>
                  <td className="px-2 py-2">
                    {o.lastLoginAt ? fmtDateTime(o.lastLoginAt) : "-"}
                  </td>
                  <td className="px-2 py-2">
                    {o.status !== "DISABLED" && (
                      <button
                        type="button"
                        className="text-rose-600 underline"
                        onClick={() => disable(o)}
                      >
                        {o.status === "INVITED" ? "초대 취소" : "비활성화"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-muted text-xs">
        활성 관리자는 최소 1명 있어야 합니다.
      </p>

      <Card title="관리자 초대">
        <form onSubmit={invite} className="flex flex-col gap-3">
          <TextField
            label="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            label="휴대폰 번호"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button type="submit" disabled={!name || !phone}>
            초대 링크 만들기
          </Button>
          {inviteUrl && (
            <Notice tone="success">
              초대 링크(7일 유효, 지금 한 번만 보입니다). 초대받는 분에게 직접
              전달해 주세요:
              <br />
              <code className="break-all" data-testid="invite-url">
                {inviteUrl}
              </code>
            </Notice>
          )}
        </form>
      </Card>

      <Card title="운영 알림">
        <ul className="flex flex-col gap-1 text-sm">
          {data.alerts.map((a) => (
            <li key={a.id} className={a.readAt ? "text-muted" : "font-medium"}>
              {fmtDateTime(a.createdAt)} · {a.message}
            </li>
          ))}
          {data.alerts.length === 0 && (
            <li className="text-muted">알림이 없습니다</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
