"use client";

import { useState } from "react";
import { api } from "@/components/api";
import type { ApprovalFields } from "@/components/approval-types";
import {
  BookingNoticeControls,
  type BookingNotice,
} from "./BookingNoticeControls";
import { TrainerApprovalActions } from "./TrainerApprovalActions";
import { STATUS_STYLE, fmtDateTime, fmtRange } from "@/components/fmt";
import { SlotInputs, type Slot } from "@/components/SlotInputs";
import { Button, Modal, Notice, TextField } from "@/components/ui";

export interface TrainerBooking extends ApprovalFields {
  notice: BookingNotice | null;
  id: string;
  studentId: string;
  studentName: string;
  studentRegistered: boolean;
  ruleUnagreed: boolean;
  startAt: string;
  endAt: string;
  status: keyof typeof STATUS_STYLE;
  source: "TRAINER" | "STUDENT";
  autoConfirmed: boolean;
  recurringGroupId: string | null;
  memo: string | null;
  cancelRequestedAt: string | null;
  cancelRequestReason: string | null;
  deducted: boolean;
  deductReason: string | null;
  deductSkippedReason: string | null;
  rejectReason: string | null;
  changeRequest: {
    id: string;
    kind: "CHANGE" | "PROPOSAL";
    mine: boolean;
    slots: Slot[];
    expiresAt: string;
  } | null;
}

/** 예약 상세 팝업 (4.2) */
export function TrainerBookingSheet({
  booking: b,
  onClose,
  onChanged,
}: {
  booking: TrainerBooking;
  onClose: () => void;
  onChanged: (message?: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [changing, setChanging] = useState(false);
  const durationMs =
    new Date(b.endAt).getTime() - new Date(b.startAt).getTime();
  const [slots, setSlots] = useState<Slot[]>([
    { startAt: b.startAt, endAt: b.endAt },
  ]);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function call(url: string, body: unknown, ok: string) {
    setError(null);
    const r = await api<{ deducted?: boolean; skippedReason?: string | null }>(
      url,
      { body },
    );
    if (!r.ok) return setError(r.message);
    let text = ok;
    if (r.data.deducted) text += " (당일 취소 1회 차감)";
    if (r.data.skippedReason === "NO_CONSENT") text += " (미동의로 차감 안 함)";
    onChanged(text);
  }

  const st = STATUS_STYLE[b.status];
  const cr = b.changeRequest;
  const incomingChange = cr && cr.kind === "CHANGE" && !cr.mine;
  const proposal = cr && cr.kind === "PROPOSAL";

  return (
    <Modal title={`${b.studentName} · ${st.label}`} onClose={onClose}>
      <p className="text-sm">{fmtRange(b.startAt, b.endAt)}</p>
      <div className="flex flex-wrap gap-1 text-xs">
        {!b.studentRegistered && (
          <span className="rounded bg-zinc-100 px-1.5 dark:bg-zinc-800">
            미가입
          </span>
        )}
        {b.ruleUnagreed && (
          <span className="rounded bg-amber-100 px-1.5 text-amber-800">
            규칙 미동의
          </span>
        )}
        {b.autoConfirmed && (
          <span className="rounded bg-zinc-100 px-1.5 dark:bg-zinc-800">
            자동 확정
          </span>
        )}
        {b.recurringGroupId && (
          <span className="rounded bg-zinc-100 px-1.5 dark:bg-zinc-800">
            반복 예약
          </span>
        )}
        {b.source === "STUDENT" && (
          <span className="rounded bg-zinc-100 px-1.5 dark:bg-zinc-800">
            수강생 신청
          </span>
        )}
      </div>
      {b.memo && <p className="text-sm text-zinc-500">메모: {b.memo}</p>}
      {b.status === "INSUFFICIENT" && (
        <Notice tone="warning">
          잔여 횟수가 부족해 진행할 수 없습니다. 이용권을 추가하면 다시
          확정됩니다. 해결되지 않으면 차감 없이 자동 취소됩니다.
        </Notice>
      )}
      {b.status === "CANCELED" && (
        <p className="text-sm text-zinc-500">
          {b.deducted
            ? "당일 취소 1회 차감"
            : b.deductSkippedReason === "NO_CONSENT"
              ? "당일 취소 · 미동의로 차감 안 함"
              : "차감 없음"}
        </p>
      )}
      {b.rejectReason && (
        <p className="text-sm text-zinc-500">거절 사유: {b.rejectReason}</p>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      {b.status === "REQUESTED" && (
        <>
          <TextField
            label="거절 사유 (거절할 때)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() =>
                call(
                  `/api/t/bookings/${b.id}/respond-request`,
                  { accept: true },
                  "신청을 수락했습니다",
                )
              }
            >
              신청 수락
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() =>
                call(
                  `/api/t/bookings/${b.id}/respond-request`,
                  { accept: false, reason },
                  "신청을 거절했습니다",
                )
              }
            >
              거절
            </Button>
          </div>
        </>
      )}

      {b.cancelRequestedAt && b.status === "CONFIRMED" && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300 p-3">
          <p className="text-sm">
            수강생이 {fmtDateTime(b.cancelRequestedAt)}에 취소를 요청했습니다
            {b.cancelRequestReason ? `: ${b.cancelRequestReason}` : ""}. 차감
            여부는 요청한 시각 기준으로 정합니다.
          </p>
          <TextField
            label="거절 사유 (거절할 때)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() =>
                call(
                  `/api/t/bookings/${b.id}/cancel-response`,
                  { accept: true },
                  "취소 요청을 수락했습니다",
                )
              }
            >
              취소 수락
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() =>
                call(
                  `/api/t/bookings/${b.id}/cancel-response`,
                  { accept: false, reason },
                  "취소 요청을 거절했습니다",
                )
              }
            >
              거절 (예약 유지)
            </Button>
          </div>
        </div>
      )}

      {proposal && (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-300 p-3 dark:border-zinc-700">
          <p className="text-sm font-medium">
            수강생이 다른 시간을 제안했습니다
          </p>
          {cr.slots.map((s, i) => (
            <Button
              key={i}
              variant="secondary"
              onClick={() =>
                call(
                  `/api/t/proposals/${cr.id}/choose`,
                  { index: i },
                  "제안한 시간으로 확정했습니다",
                )
              }
            >
              {fmtRange(s.startAt, s.endAt)}로 확정
            </Button>
          ))}
        </div>
      )}

      {incomingChange && (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-300 p-3 dark:border-zinc-700">
          <p className="text-sm font-medium">
            수강생의 시간 변경 요청 (수락할 때까지 원래 시간 유지)
          </p>
          {cr.slots.map((s, i) => (
            <Button
              key={i}
              variant="secondary"
              onClick={() =>
                call(
                  `/api/bookings/change-requests/${cr.id}`,
                  { action: "ACCEPT", index: i },
                  "변경 요청을 수락했습니다",
                )
              }
            >
              {fmtRange(s.startAt, s.endAt)}로 변경 수락
            </Button>
          ))}
          <Button
            variant="ghost"
            onClick={() =>
              call(
                `/api/bookings/change-requests/${cr.id}`,
                { action: "REJECT" },
                "변경 요청을 거절했습니다",
              )
            }
          >
            거절 (원래 시간 유지)
          </Button>
        </div>
      )}
      {cr && cr.kind === "CHANGE" && cr.mine && (
        <Notice>
          변경 요청 중:{" "}
          {cr.slots.map((s) => fmtRange(s.startAt, s.endAt)).join(", ")} (만료{" "}
          {fmtDateTime(cr.expiresAt)})
        </Notice>
      )}

      {(b.status === "CONFIRMED" || b.status === "PENDING_CONFIRM") &&
        !b.cancelRequestedAt && (
          <>
            {changing ? (
              <div className="flex flex-col gap-2">
                <SlotInputs
                  slots={slots}
                  onChange={setSlots}
                  durationMs={durationMs}
                  max={b.status === "CONFIRMED" ? 3 : 1}
                  label="새 시간"
                />
                <Button
                  onClick={() =>
                    b.status === "PENDING_CONFIRM"
                      ? call(
                          `/api/t/bookings/${b.id}/reschedule`,
                          slots[0],
                          "시간을 바꾸고 확정 요청을 다시 보냈습니다",
                        )
                      : call(
                          `/api/bookings/${b.id}/change-request`,
                          { slots },
                          "변경 요청을 보냈습니다",
                        )
                  }
                >
                  {b.status === "PENDING_CONFIRM"
                    ? "시간 바꾸기"
                    : "변경 요청 보내기"}
                </Button>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => setChanging(true)}>
                {b.status === "PENDING_CONFIRM"
                  ? "시간 수정"
                  : "시간 변경 요청"}
              </Button>
            )}
          </>
        )}

      {[
        "PENDING_CONFIRM",
        "CONFIRMED",
        "INSUFFICIENT",
        "PENDING_APPROVAL",
      ].includes(b.status) &&
        (confirmCancel ? (
          <div className="flex flex-col gap-2">
            <TextField
              label="취소 사유 (선택)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              variant="danger"
              onClick={() =>
                call(
                  `/api/t/bookings/${b.id}/cancel`,
                  { reason },
                  "예약을 취소했습니다 (차감 없음)",
                )
              }
            >
              예약 취소 확인
            </Button>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
            예약 취소 (차감 없음)
          </Button>
        ))}
      <TrainerApprovalActions b={b} call={call} onChanged={onChanged} />
      <BookingNoticeControls
        bookingId={b.id}
        status={b.status}
        notice={b.notice}
        onChanged={onChanged}
      />
    </Modal>
  );
}
