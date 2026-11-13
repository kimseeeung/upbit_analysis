"use client";

import { useState } from "react";
import { api } from "@/components/api";
import {
  APPROVAL_METHOD_LABEL,
  type ApprovalFields,
} from "@/components/approval-types";
import { fmtDateTime } from "@/components/fmt";
import { Button, Notice, PasswordField, TextField } from "@/components/ui";

/** 현장 완료 승인: 트레이너 기기를 수강생에게 건네 PIN을 입력받는 전체 화면 */
function OnsitePin({
  bookingId,
  studentName,
  onDone,
  onClose,
}: {
  bookingId: string;
  studentName: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    const r = await api(`/api/t/bookings/${bookingId}/approve-onsite`, {
      body: { pin },
    });
    if (r.ok) onDone();
    else {
      setError(r.message);
      setPin("");
    }
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="현장 완료 승인"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-white p-6 dark:bg-zinc-950"
    >
      <p className="text-lg font-semibold">
        {studentName}님, 수업 완료를 승인해 주세요
      </p>
      <p className="text-sm text-zinc-500">
        수업 완료 승인 PIN 4자리를 입력하면 1회 차감됩니다.
      </p>
      <div className="w-full max-w-xs">
        <PasswordField
          label="PIN"
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        />
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex w-full max-w-xs gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          닫기
        </Button>
        <Button className="flex-1" disabled={pin.length !== 4} onClick={submit}>
          승인
        </Button>
      </div>
    </div>
  );
}

/** 트레이너 예약 상세의 완료 승인·노쇼·이견 처리 (5장) */
export function TrainerApprovalActions({
  b,
  call,
  onChanged,
}: {
  b: ApprovalFields & {
    id: string;
    studentName: string;
    status: string;
    startAt: string;
    studentRegistered: boolean;
  };
  call: (url: string, body: unknown, ok: string) => Promise<void>;
  onChanged: (message?: string) => void;
}) {
  const [onsite, setOnsite] = useState(false);
  const [reason, setReason] = useState("");
  // 팝업을 연 시각 기준 (렌더 중에는 현재 시각을 읽지 않는다)
  const [openedAt] = useState(() => Date.now());
  const started = new Date(b.startAt).getTime() <= openedAt;

  return (
    <div className="flex flex-col gap-2">
      {b.status === "COMPLETED" && b.approvalMethod && (
        <p className="text-sm text-zinc-500">
          완료 · {b.approvedAt ? fmtDateTime(b.approvedAt) : ""} ·{" "}
          {APPROVAL_METHOD_LABEL[b.approvalMethod]}
        </p>
      )}
      {b.disputeKind && (
        <div className="flex flex-col gap-2 rounded-lg border border-red-300 p-3">
          <p className="text-sm font-medium">
            이견 있음 ·{" "}
            {b.disputeKind === "COMPLETION_REJECTED"
              ? "수강생이 완료 승인을 거절"
              : "노쇼 이의 제기"}
          </p>
          <p className="text-sm">수강생 사유: {b.disputeStudentReason}</p>
          {b.disputeResolvedAt ? (
            <p className="text-sm text-zinc-500">
              처리:{" "}
              {b.disputeTrainerDecision === "KEEP"
                ? "기존 처리 유지"
                : "수강생 의견 수락"}
              {b.disputeTrainerReason ? ` (${b.disputeTrainerReason})` : ""}
            </p>
          ) : (
            <>
              <TextField
                label="트레이너 사유 (선택)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="text-xs text-zinc-500">
                선택하면 종결되고 다시 요청할 수 없습니다. 7일 안에 고르지
                않으면 수강생 의견 수락으로 처리됩니다.
              </p>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() =>
                    call(
                      `/api/t/bookings/${b.id}/dispute-decision`,
                      { decision: "ACCEPT_STUDENT", reason },
                      "수강생 의견을 수락했습니다",
                    )
                  }
                >
                  수강생 의견 수락
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() =>
                    call(
                      `/api/t/bookings/${b.id}/dispute-decision`,
                      { decision: "KEEP", reason },
                      "기존 처리를 유지했습니다",
                    )
                  }
                >
                  기존 처리 유지
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      {b.status === "PENDING_APPROVAL" && !b.disputed && (
        <>
          <p className="text-sm text-zinc-500">
            {b.approvalRequestedAt
              ? `${fmtDateTime(b.approvalRequestedAt)}에 승인 요청을 보냈습니다.`
              : ""}
          </p>
          {b.trainerConfirmNeeded ? (
            <>
              <Notice tone="warning">
                규칙 미동의 수강생이라 자동 완료하지 않았습니다. 직접 완료
                처리해 주세요.
              </Notice>
              <Button
                onClick={() =>
                  call(
                    `/api/t/bookings/${b.id}/trainer-confirm`,
                    {},
                    "트레이너 확정으로 완료 처리했습니다",
                  )
                }
              >
                트레이너 확정 (완료 처리)
              </Button>
            </>
          ) : (
            b.studentRegistered && (
              <Button onClick={() => setOnsite(true)}>
                현장 완료 승인 (PIN)
              </Button>
            )
          )}
          {!b.studentRegistered && (
            <p className="text-xs text-zinc-500">
              미가입 수강생은 카톡 링크에서 가입한 뒤 승인할 수 있습니다.
            </p>
          )}
          <Button
            variant="secondary"
            onClick={() =>
              call(`/api/t/bookings/${b.id}/no-show`, {}, "노쇼로 바꿨습니다")
            }
          >
            노쇼로 변경 (종료 후 24시간 안)
          </Button>
        </>
      )}
      {b.status === "CONFIRMED" && started && (
        <Button
          variant="secondary"
          onClick={() =>
            call(`/api/t/bookings/${b.id}/no-show`, {}, "노쇼로 처리했습니다")
          }
        >
          노쇼 처리
        </Button>
      )}
      {onsite && (
        <OnsitePin
          bookingId={b.id}
          studentName={b.studentName}
          onClose={() => setOnsite(false)}
          onDone={() => {
            setOnsite(false);
            onChanged("수업 완료를 승인했습니다 (1회 차감)");
          }}
        />
      )}
    </div>
  );
}
