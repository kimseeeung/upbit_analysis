"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { ApprovalInboxItems, type ApprovalInbox } from "./ApprovalInboxItems";
import { fmtDateTime, fmtRange } from "./fmt";
import { RulesLines } from "./RulesEditor";
import { Button, Card, Notice, TextField } from "./ui";

interface Slot {
  startAt: string;
  endAt: string;
}

interface BookingInbox {
  bookingRequests: {
    bookingId: string;
    name: string;
    startAt: string;
    endAt: string;
  }[];
  cancelRequests: {
    bookingId: string;
    name: string;
    startAt: string;
    requestedAt: string;
    reason: string | null;
  }[];
  changeRequests: {
    requestId: string;
    kind: "CHANGE" | "PROPOSAL";
    bookingId: string;
    name: string;
    startAt: string;
    endAt: string;
    slots: Slot[];
    expiresAt: string;
  }[];
  confirmRequests: {
    bookingId: string;
    trainerName: string;
    grouped: boolean;
    times: Slot[];
  }[];
}

interface Inbox extends BookingInbox, ApprovalInbox {
  linkRequests: {
    id: string;
    fromName: string;
    fromRole: "TRAINER" | "STUDENT" | "CENTER_ADMIN";
    fromPhoneMasked: string;
    workplace: string | null;
    createdAt: string;
  }[];
  ruleConsents: {
    id: string;
    status: "PENDING" | "INQUIRED";
    passName: string;
    trainerName: string;
    requestedAt: string;
    rules: { title: string; text: string }[];
  }[];
}

function ConsentItem({
  c,
  reload,
}: {
  c: Inbox["ruleConsents"][number];
  reload: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function respond(action: "AGREE" | "INQUIRE") {
    const r = await api(`/api/s/rule-consents/${c.id}`, {
      body: { action, inquiryText: text },
    });
    if (r.ok) reload();
    else setError(r.message);
  }
  return (
    <Card title={`수강 규칙 동의 · ${c.passName}`}>
      <p className="text-sm text-zinc-500">
        {c.trainerName} 트레이너가 수강 규칙 동의를 요청했습니다.
      </p>
      <RulesLines lines={c.rules} />
      {c.status === "INQUIRED" && (
        <Notice>문의를 보냈습니다. 트레이너 답변 후 동의해 주세요.</Notice>
      )}
      {asking && (
        <TextField
          label="문의 내용"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => respond("AGREE")}>
          동의
        </Button>
        {asking ? (
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => respond("INQUIRE")}
          >
            문의 보내기
          </Button>
        ) : (
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setAsking(true)}
          >
            문의하기
          </Button>
        )}
      </div>
    </Card>
  );
}

/** 요청함 (트레이너·수강생 공통): 연결 요청, (수강생) 규칙 동의 */
export function RequestsInbox() {
  const [data, setData] = useState<Inbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<Inbox>("/api/requests");
    if (r.ok) setData(r.data);
    else setError(r.message);
  }, []);
  useEffect(() => {
    // 처음 열 때 요청함을 불러온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function respondLink(id: string, accept: boolean) {
    const r = await api(`/api/requests/link/${id}`, { body: { accept } });
    if (r.ok) void load();
    else setError(r.message);
  }

  if (!data)
    return error ? (
      <Notice tone="error">{error}</Notice>
    ) : (
      <p className="text-sm text-zinc-500">불러오는 중…</p>
    );
  async function post(url: string, body: unknown) {
    setError(null);
    const r = await api(url, { body });
    if (r.ok) void load();
    else setError(r.message);
  }
  const empty =
    data.linkRequests.length === 0 &&
    data.ruleConsents.length === 0 &&
    data.bookingRequests.length === 0 &&
    data.cancelRequests.length === 0 &&
    data.changeRequests.length === 0 &&
    data.confirmRequests.length === 0 &&
    data.approvalRequests.length === 0 &&
    data.disputes.length === 0 &&
    data.trainerConfirms.length === 0;
  return (
    <div className="flex flex-col gap-3">
      {error && <Notice tone="error">{error}</Notice>}
      {empty && (
        <p className="text-sm text-zinc-500">처리할 요청이 없습니다.</p>
      )}
      {data.linkRequests.map((l) => (
        <Card key={l.id} title="연결 요청">
          <p className="text-sm">
            {l.fromRole === "TRAINER"
              ? `${l.fromName} 트레이너`
              : `${l.fromName} 수강생`}
            {l.workplace && (
              <span className="text-zinc-500"> · {l.workplace}</span>
            )}
            <span className="block text-xs text-zinc-500">
              {l.fromPhoneMasked}
            </span>
          </p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => respondLink(l.id, true)}>
              수락
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => respondLink(l.id, false)}
            >
              거절
            </Button>
          </div>
        </Card>
      ))}
      <ApprovalInboxItems data={data} post={post} />
      {data.confirmRequests.map((c) => (
        <Card
          key={c.bookingId}
          title={
            c.grouped
              ? `예약 확정 요청 (반복 ${c.times.length}건)`
              : "예약 확정 요청"
          }
        >
          <p className="text-sm text-zinc-500">{c.trainerName} 트레이너</p>
          <ul className="text-sm">
            {c.times.map((t) => (
              <li key={t.startAt}>{fmtRange(t.startAt, t.endAt)}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() =>
                post(`/api/s/bookings/${c.bookingId}/confirm`, {
                  accept: true,
                  wholeGroup: true,
                })
              }
            >
              {c.grouped ? "모두 수락" : "수락"}
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() =>
                post(`/api/s/bookings/${c.bookingId}/confirm`, {
                  accept: false,
                  wholeGroup: true,
                })
              }
            >
              {c.grouped ? "모두 거절" : "거절"}
            </Button>
          </div>
          <p className="text-xs text-zinc-500">
            다른 시간 제안은 캘린더에서 예약을 눌러 할 수 있습니다.
          </p>
        </Card>
      ))}
      {data.bookingRequests.map((b) => (
        <Card key={b.bookingId} title="예약 신청">
          <p className="text-sm">
            {b.name} · {fmtRange(b.startAt, b.endAt)}
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() =>
                post(`/api/t/bookings/${b.bookingId}/respond-request`, {
                  accept: true,
                })
              }
            >
              수락
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() =>
                post(`/api/t/bookings/${b.bookingId}/respond-request`, {
                  accept: false,
                })
              }
            >
              거절
            </Button>
          </div>
        </Card>
      ))}
      {data.cancelRequests.map((b) => (
        <Card key={b.bookingId} title="취소 요청">
          <p className="text-sm">
            {b.name} · {fmtDateTime(b.startAt)} 수업
            <span className="block text-xs text-zinc-500">
              {fmtDateTime(b.requestedAt)} 요청
              {b.reason ? ` · ${b.reason}` : ""} (차감은 요청 시각 기준)
            </span>
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() =>
                post(`/api/t/bookings/${b.bookingId}/cancel-response`, {
                  accept: true,
                })
              }
            >
              취소 수락
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() =>
                post(`/api/t/bookings/${b.bookingId}/cancel-response`, {
                  accept: false,
                })
              }
            >
              거절
            </Button>
          </div>
        </Card>
      ))}
      {data.changeRequests.map((c) => (
        <Card
          key={c.requestId}
          title={c.kind === "PROPOSAL" ? "다른 시간 제안" : "시간 변경 요청"}
        >
          <p className="text-sm">
            {c.name} · 지금 {fmtRange(c.startAt, c.endAt)}
            <span className="block text-xs text-zinc-500">
              {fmtDateTime(c.expiresAt)}까지 응답이 없으면 원래 시간대로 진행
            </span>
          </p>
          {c.slots.map((s, i) => (
            <Button
              key={s.startAt}
              variant="secondary"
              onClick={() =>
                c.kind === "PROPOSAL"
                  ? post(`/api/t/proposals/${c.requestId}/choose`, { index: i })
                  : post(`/api/bookings/change-requests/${c.requestId}`, {
                      action: "ACCEPT",
                      index: i,
                    })
              }
            >
              {fmtRange(s.startAt, s.endAt)}(으)로{" "}
              {c.kind === "PROPOSAL" ? "확정" : "변경 수락"}
            </Button>
          ))}
          {c.kind === "CHANGE" && (
            <Button
              variant="ghost"
              onClick={() =>
                post(`/api/bookings/change-requests/${c.requestId}`, {
                  action: "REJECT",
                })
              }
            >
              거절 (원래 시간 유지)
            </Button>
          )}
        </Card>
      ))}
      {data.ruleConsents.map((c) => (
        <ConsentItem key={c.id} c={c} reload={load} />
      ))}
    </div>
  );
}
