"use client";

import { useState } from "react";
import { fmtDateTime, fmtRange } from "./fmt";
import { Button, Card, PasswordField, TextField } from "./ui";

export interface ApprovalInbox {
  approvalRequests: {
    bookingId: string;
    trainerName: string;
    startAt: string;
    endAt: string;
  }[];
  disputes: {
    bookingId: string;
    name: string;
    kind: "COMPLETION_REJECTED" | "NO_SHOW_OBJECTION" | null;
    startAt: string;
    endAt: string;
    reason: string | null;
    disputeAt: string;
  }[];
  trainerConfirms: {
    bookingId: string;
    name: string;
    startAt: string;
    endAt: string;
  }[];
}

function ApproveItem({
  a,
  post,
}: {
  a: ApprovalInbox["approvalRequests"][number];
  post: (url: string, body: unknown) => Promise<void>;
}) {
  const [pin, setPin] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Card title="수업 완료 승인">
      <p className="text-sm">
        {fmtRange(a.startAt, a.endAt)} · {a.trainerName} 트레이너
      </p>
      {rejecting ? (
        <>
          <TextField
            label="거절 사유"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            variant="danger"
            disabled={!reason.trim()}
            onClick={() =>
              post(`/api/s/bookings/${a.bookingId}/dispute`, { reason })
            }
          >
            거절 보내기
          </Button>
        </>
      ) : (
        <>
          <PasswordField
            label="PIN"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={pin.length !== 4}
              onClick={() =>
                post(`/api/s/bookings/${a.bookingId}/approve`, { pin })
              }
            >
              승인
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setRejecting(true)}
            >
              거절
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function DisputeItem({
  d,
  post,
}: {
  d: ApprovalInbox["disputes"][number];
  post: (url: string, body: unknown) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  return (
    <Card
      title={
        d.kind === "COMPLETION_REJECTED" ? "완료 승인 거절" : "노쇼 이의 제기"
      }
    >
      <p className="text-sm">
        {d.name} · {fmtRange(d.startAt, d.endAt)}
        <span className="block text-xs text-zinc-500">
          {fmtDateTime(d.disputeAt)} · 사유: {d.reason}
        </span>
      </p>
      <TextField
        label="트레이너 사유 (선택)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() =>
            post(`/api/t/bookings/${d.bookingId}/dispute-decision`, {
              decision: "ACCEPT_STUDENT",
              reason,
            })
          }
        >
          수강생 의견 수락
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() =>
            post(`/api/t/bookings/${d.bookingId}/dispute-decision`, {
              decision: "KEEP",
              reason,
            })
          }
        >
          기존 처리 유지
        </Button>
      </div>
      <p className="text-xs text-zinc-500">
        7일 안에 고르지 않으면 수강생 의견 수락으로 처리됩니다.
      </p>
    </Card>
  );
}

export function ApprovalInboxItems({
  data,
  post,
}: {
  data: ApprovalInbox;
  post: (url: string, body: unknown) => Promise<void>;
}) {
  return (
    <>
      {data.approvalRequests.map((a) => (
        <ApproveItem key={a.bookingId} a={a} post={post} />
      ))}
      {data.disputes.map((d) => (
        <DisputeItem key={d.bookingId} d={d} post={post} />
      ))}
      {data.trainerConfirms.map((t) => (
        <Card key={t.bookingId} title="트레이너 확정 필요">
          <p className="text-sm">
            {t.name} · {fmtRange(t.startAt, t.endAt)}
            <span className="block text-xs text-zinc-500">
              규칙 미동의 수강생의 미승인 기한이 지났습니다. 직접 완료 처리해
              주세요.
            </span>
          </p>
          <Button
            onClick={() =>
              post(`/api/t/bookings/${t.bookingId}/trainer-confirm`, {})
            }
          >
            트레이너 확정 (완료 처리)
          </Button>
        </Card>
      ))}
    </>
  );
}
