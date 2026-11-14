"use client";

import { useState } from "react";
import { api } from "./api";
import { fmtDateTime, fmtRange } from "./fmt";
import { Button, Card } from "./ui";

export interface TransferInbox {
  transferRequests: {
    id: string;
    studentName: string;
    fromTrainerName: string | null;
    initiatedBy: string;
  }[];
  passDecisions: { id: string; studentName: string; toTrainerName: string }[];
  transferConsents: {
    id: string;
    fromTrainerName: string | null;
    toTrainerName: string;
    initiatedBy: string;
  }[];
  departureChoices: {
    id: string;
    trainerName: string;
    type: "MOVE" | "WITHDRAW";
    deadlineAt: string;
    choice: string | null;
    options: { value: string; label: string }[];
    defaultChoice: string;
  }[];
}

/** 새 트레이너: 담당 요청 수락 (예정 예약별 유지·취소) */
function TransferAccept({
  t,
  post,
}: {
  t: TransferInbox["transferRequests"][number];
  post: (url: string, body: unknown) => Promise<void>;
}) {
  const [detail, setDetail] = useState<{
    bookings: { id: string; startAt: string; endAt: string }[];
  } | null>(null);
  const [decisions, setDecisions] = useState<Record<string, "KEEP" | "CANCEL">>(
    {},
  );
  async function open() {
    const r = await api<{
      bookings: { id: string; startAt: string; endAt: string }[];
    }>(`/api/t/transfers/${t.id}`);
    if (r.ok) {
      setDetail(r.data);
      setDecisions(
        Object.fromEntries(r.data.bookings.map((b) => [b.id, "KEEP"])),
      );
    }
  }
  return (
    <Card title="담당 요청">
      <p className="text-sm">
        {t.studentName}님
        {t.fromTrainerName ? ` (이전 ${t.fromTrainerName} 트레이너)` : ""}의
        담당 요청입니다.
      </p>
      {!detail ? (
        <Button variant="secondary" onClick={open}>
          내용 보고 수락하기
        </Button>
      ) : (
        <>
          {detail.bookings.length > 0 && (
            <p className="text-muted text-xs">
              이전 트레이너와 잡힌 예정 예약을 유지할지 정해 주세요 (취소는 차감
              없음).
            </p>
          )}
          {detail.bookings.map((b) => (
            <label
              key={b.id}
              className="flex items-center justify-between text-sm"
            >
              {fmtRange(b.startAt, b.endAt)}
              <select
                aria-label={`${fmtRange(b.startAt, b.endAt)} 예약`}
                value={decisions[b.id]}
                onChange={(e) =>
                  setDecisions((d) => ({
                    ...d,
                    [b.id]: e.target.value as "KEEP" | "CANCEL",
                  }))
                }
                className="border-line rounded border px-2 py-1"
              >
                <option value="KEEP">유지</option>
                <option value="CANCEL">취소(차감 없음)</option>
              </select>
            </label>
          ))}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() =>
                post(`/api/t/transfers/${t.id}/respond`, {
                  accept: true,
                  bookingDecisions: decisions,
                })
              }
            >
              수락
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() =>
                post(`/api/t/transfers/${t.id}/respond`, { accept: false })
              }
            >
              거절
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

export function TransferInboxItems({
  data,
  post,
}: {
  data: TransferInbox;
  post: (url: string, body: unknown) => Promise<void>;
}) {
  return (
    <>
      {data.transferRequests.map((t) => (
        <TransferAccept key={t.id} t={t} post={post} />
      ))}
      {data.passDecisions.map((t) => (
        <Card key={t.id} title="남은 이용권 넘기기">
          <p className="text-sm">
            {t.studentName}님의 담당이 {t.toTrainerName} 트레이너로 바뀝니다.
            남은 이용권을 넘길까요?
            <span className="text-muted block text-xs">
              넘기지 않으면 이용권은 사용 중지로 남고, 정산은 앱 밖에서 합니다.
            </span>
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() =>
                post(`/api/t/transfers/${t.id}/pass`, { agree: true })
              }
            >
              넘기기
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() =>
                post(`/api/t/transfers/${t.id}/pass`, { agree: false })
              }
            >
              넘기지 않음
            </Button>
          </div>
        </Card>
      ))}
      {data.transferConsents.map((t) => (
        <Card key={t.id} title="담당 트레이너 변경 동의">
          <p className="text-sm">
            담당 트레이너가 {t.fromTrainerName ?? "없음"} → {t.toTrainerName}
            (으)로 바뀝니다. 계정·이용권·이력은 그대로 이어집니다.
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() =>
                post(`/api/s/transfers/${t.id}/respond`, { agree: true })
              }
            >
              동의
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() =>
                post(`/api/s/transfers/${t.id}/respond`, { agree: false })
              }
            >
              거절
            </Button>
          </div>
        </Card>
      ))}
      {data.departureChoices.map((c) => (
        <Card
          key={c.id}
          title={c.type === "MOVE" ? "트레이너 센터 이동" : "트레이너 탈퇴"}
        >
          <p className="text-sm">
            {c.trainerName} 트레이너가{" "}
            {c.type === "MOVE" ? "센터를 옮깁니다" : "탈퇴합니다"}.{" "}
            {fmtDateTime(c.deadlineAt)}까지 골라 주세요.
            <span className="text-muted block text-xs">
              고르지 않으면 &quot;
              {c.options.find((o) => o.value === c.defaultChoice)?.label}
              &quot;로 처리됩니다.
              {c.choice &&
                ` 지금 선택: ${c.options.find((o) => o.value === c.choice)?.label}`}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {c.options.map((o) => (
              <Button
                key={o.value}
                variant={c.choice === o.value ? "primary" : "secondary"}
                onClick={() =>
                  post(`/api/s/departure-choices/${c.id}`, { choice: o.value })
                }
              >
                {o.label}
              </Button>
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}
