"use client";

import { useState } from "react";
import {
  APPROVAL_METHOD_LABEL,
  type ApprovalFields,
} from "@/components/approval-types";
import { fmtDateTime } from "@/components/fmt";
import { Button, Notice, PasswordField, TextField } from "@/components/ui";

/** 수강생 예약 상세: 완료 승인(PIN)·거절, 완료 정보, 노쇼 이의 제기 (5장, 10장) */
export function StudentApprovalActions({
  b,
  call,
}: {
  b: ApprovalFields & {
    id: string;
    status: string;
    deducted: boolean;
    deductSkippedReason: string | null;
    appliedRule: string | null;
  };
  call: (url: string, body: unknown, ok: string) => Promise<void>;
}) {
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const disputeInfo = b.disputeKind && (
    <Notice tone={b.disputeResolvedAt ? "info" : "warning"}>
      {b.disputeKind === "COMPLETION_REJECTED"
        ? "완료 승인을 거절했습니다"
        : "노쇼에 이의를 제기했습니다"}
      : {b.disputeStudentReason}
      {b.disputeResolvedAt
        ? ` → ${b.disputeTrainerDecision === "KEEP" ? "트레이너가 기존 처리를 유지했습니다" : "트레이너가 의견을 수락했습니다"}${b.disputeTrainerReason ? ` (${b.disputeTrainerReason})` : ""}`
        : " · 트레이너 확인을 기다리는 중입니다"}
    </Notice>
  );

  if (b.status === "PENDING_APPROVAL") {
    if (b.disputed) return disputeInfo;
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm">
          수업이 끝났습니다. PIN을 입력해 완료를 승인해 주세요 (1회 차감).
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
                call(
                  `/api/s/bookings/${b.id}/dispute`,
                  { reason },
                  "완료 승인을 거절했습니다",
                )
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
                  call(
                    `/api/s/bookings/${b.id}/approve`,
                    { pin },
                    "수업 완료를 승인했습니다",
                  )
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
            <p className="text-muted text-xs">
              PIN을 5회 틀리면 잠깁니다. 내 정보에서 본인인증 후 다시 설정할 수
              있습니다.
            </p>
          </>
        )}
      </div>
    );
  }
  if (b.status === "COMPLETED") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted text-sm">
          완료 · {b.approvedAt ? fmtDateTime(b.approvedAt) : ""}
          {b.approvalMethod
            ? ` · ${APPROVAL_METHOD_LABEL[b.approvalMethod]}`
            : ""}
        </p>
        {disputeInfo}
      </div>
    );
  }
  if (b.status === "NO_SHOW") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm">
          노쇼 ·{" "}
          {b.deducted
            ? "1회 차감"
            : b.deductSkippedReason === "NO_CONSENT"
              ? "미동의로 차감 안 함"
              : "차감 없음"}
        </p>
        {b.appliedRule && (
          <p className="text-muted text-xs">적용 규칙: {b.appliedRule}</p>
        )}
        {disputeInfo}
        {!b.disputeKind &&
          (rejecting ? (
            <>
              <TextField
                label="이의 사유"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                disabled={!reason.trim()}
                onClick={() =>
                  call(
                    `/api/s/bookings/${b.id}/dispute`,
                    { reason },
                    "이의를 제기했습니다",
                  )
                }
              >
                이의 제기 보내기
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setRejecting(true)}>
              이의 제기
            </Button>
          ))}
      </div>
    );
  }
  if (b.status === "CANCELED") {
    return (
      <>
        {b.appliedRule && (
          <p className="text-muted text-xs">적용 규칙: {b.appliedRule}</p>
        )}
        {disputeInfo}
      </>
    );
  }
  return null;
}
