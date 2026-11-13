"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { fmtDateTime } from "@/components/fmt";
import { Button, Card, Notice } from "@/components/ui";

interface Data {
  center: {
    id: string;
    name: string;
    status: string;
    dissolveAt: string | null;
    verified: boolean;
  };
  admins: { userId: string; name: string; isTrainer: boolean; me: boolean }[];
  members: {
    membershipId: string;
    trainerId: string;
    name: string;
    phoneMasked: string;
    status: "PENDING" | "ACTIVE" | "LEFT";
    waitingConsent: boolean;
    joinedAt: string | null;
    leftAt: string | null;
  }[];
  departures: {
    id: string;
    trainerName: string;
    type: string;
    deadlineAt: string;
    applied: boolean;
    follow: number;
    stay: number;
    findOwn: number;
    pending: number;
  }[];
}

/** 트레이너 관리 (9.3): 목록, 소속 승인·거절, 초대, 해제, 이동 진행 상황 */
export function CenterTrainers() {
  const [d, setD] = useState<Data | null>(null);
  const [invite, setInvite] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const load = useCallback(async () => {
    const r = await api<Data>("/api/c/trainers");
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
  const pending = d.members.filter((m) => m.status === "PENDING");
  const active = d.members.filter((m) => m.status === "ACTIVE");
  const left = d.members.filter((m) => m.status === "LEFT" && m.joinedAt);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">
        트레이너 관리 · {d.center.name}{" "}
        {d.center.verified && (
          <span className="text-xs text-blue-600">인증 센터</span>
        )}
      </h1>
      {d.center.status === "DISSOLVING" && d.center.dissolveAt && (
        <Notice tone="warning">
          {fmtDateTime(d.center.dissolveAt)}에 해산됩니다.
        </Notice>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Card title="초대">
        <Button
          variant="secondary"
          onClick={async () => {
            const r = await api<{ code: string; expiresAt: string }>(
              "/api/c/invites",
              { body: { kind: "TRAINER" } },
            );
            if (r.ok) setInvite(r.data);
            else setMsg({ tone: "error", text: r.message });
          }}
        >
          트레이너 초대 코드 만들기
        </Button>
        {invite && (
          <p className="text-sm">
            초대 코드: <strong data-testid="invite-code">{invite.code}</strong>{" "}
            ({fmtDateTime(invite.expiresAt)}까지). 트레이너가 내 정보 &gt; 센터
            소속에서 입력합니다.
          </p>
        )}
      </Card>
      {pending.length > 0 && (
        <Card title="소속 요청">
          {pending.map((m) => (
            <div
              key={m.membershipId}
              className="flex items-center justify-between text-sm"
            >
              <span>
                {m.name} <span className="text-zinc-500">{m.phoneMasked}</span>
                {m.waitingConsent && (
                  <span className="ml-1 text-xs text-zinc-500">
                    (트레이너 동의 대기)
                  </span>
                )}
              </span>
              {!m.waitingConsent && (
                <span className="flex gap-1">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      post(
                        `/api/c/memberships/${m.membershipId}/respond`,
                        { approve: true },
                        "소속을 승인했습니다",
                      )
                    }
                  >
                    승인
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      post(
                        `/api/c/memberships/${m.membershipId}/respond`,
                        { approve: false },
                        "소속 요청을 거절했습니다",
                      )
                    }
                  >
                    거절
                  </Button>
                </span>
              )}
            </div>
          ))}
        </Card>
      )}
      <Card title={`소속 트레이너 (${active.length}명)`}>
        {active.map((m) => (
          <div
            key={m.membershipId}
            className="flex items-center justify-between text-sm"
          >
            <span>
              {m.name} <span className="text-zinc-500">{m.phoneMasked}</span>
            </span>
            <Button
              variant="ghost"
              onClick={() =>
                post(
                  `/api/c/trainers/${m.trainerId}/release`,
                  {},
                  "소속 해제를 시작했습니다. 수강생 선택 기한(7일) 뒤 적용됩니다",
                )
              }
            >
              소속 해제
            </Button>
          </div>
        ))}
      </Card>
      {d.departures.length > 0 && (
        <Card title="이동 진행 상황">
          {d.departures.map((x) => (
            <p key={x.id} className="text-sm">
              {x.trainerName} · {x.type === "MOVE" ? "이동" : "탈퇴"} ·{" "}
              {x.applied ? "적용됨" : `${fmtDateTime(x.deadlineAt)}까지`} ·
              따라감 {x.follow} / 남음 {x.stay} / 직접 찾기 {x.findOwn} / 미응답{" "}
              {x.pending}
            </p>
          ))}
        </Card>
      )}
      {left.length > 0 && (
        <Card title="이전 소속">
          {left.map((m) => (
            <p key={m.membershipId} className="text-sm text-zinc-500">
              {m.name} · {m.joinedAt?.slice(0, 10)} ~ {m.leftAt?.slice(0, 10)}{" "}
              (이 기간의 기록만 볼 수 있습니다)
            </p>
          ))}
        </Card>
      )}
      <Card title="관리자">
        {d.admins.map((a) => (
          <p key={a.userId} className="text-sm">
            {a.name}{" "}
            {a.isTrainer && (
              <span className="text-xs text-zinc-500">트레이너</span>
            )}{" "}
            {a.me && <span className="text-xs text-blue-600">나</span>}
          </p>
        ))}
      </Card>
    </div>
  );
}
