"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { OFFLINE_DISABLED } from "@/lib/offline/network";
import type { ApprovalFields } from "@/components/approval-types";
import { StudentApprovalActions } from "./StudentApprovalActions";
import { STATUS_STYLE, fmtDateTime, fmtRange } from "@/components/fmt";
import { SlotInputs, type Slot } from "@/components/SlotInputs";
import { Button, Checkbox, Modal, Notice, TextField } from "@/components/ui";

export interface StudentBooking extends ApprovalFields {
  appliedRule: string | null;
  id: string;
  trainerName: string;
  startAt: string;
  endAt: string;
  status: keyof typeof STATUS_STYLE;
  autoConfirmed: boolean;
  recurringGroupId: string | null;
  cancelRequestedAt: string | null;
  canceledBy: string | null;
  canceledAt: string | null;
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
  needsAction: boolean;
}

/** 수강생 예약 상세 팝업 (10장): 상태별 버튼 */
export function StudentBookingSheet({
  booking: b,
  onClose,
  onChanged,
}: {
  booking: StudentBooking;
  onClose: () => void;
  onChanged: (message?: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<
    "none" | "propose" | "change" | "cancel" | "reject" | "counter"
  >("none");
  const durationMs =
    new Date(b.endAt).getTime() - new Date(b.startAt).getTime();
  const [slots, setSlots] = useState<Slot[]>([
    { startAt: b.startAt, endAt: b.endAt },
  ]);
  const [wholeGroup, setWholeGroup] = useState(!!b.recurringGroupId);
  const [preview, setPreview] = useState<{
    deduct: boolean;
    lateCancel: boolean;
    skippedReason: string | null;
    lateCancelHours: number;
  } | null>(null);

  useEffect(() => {
    if (mode !== "cancel") return;
    api<typeof preview>(`/api/s/bookings/${b.id}/cancel-request`).then(
      (r) => r.ok && setPreview(r.data),
    );
  }, [mode, b.id]);

  async function call(url: string, body: unknown, ok: string) {
    setError(null);
    const r = await api(url, { body });
    // 오프라인: 수강생의 응답·신청·취소 요청은 할 수 없음 (11.2)
    if (!r.ok)
      return setError(r.code === "NETWORK" ? OFFLINE_DISABLED : r.message);
    onChanged(ok);
  }

  const cr = b.changeRequest;
  return (
    <Modal title={STATUS_STYLE[b.status].label} onClose={onClose}>
      <p className="text-sm">
        {fmtRange(b.startAt, b.endAt)} · {b.trainerName} 트레이너
      </p>
      {b.autoConfirmed && (
        <p className="text-muted text-xs">
          응답이 없어 수업 시작에 자동 확정되었습니다
        </p>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      {b.status === "PENDING_CONFIRM" && (
        <>
          {b.recurringGroupId && (
            <Checkbox
              label="반복 예약 전체에 한 번에 응답"
              checked={wholeGroup}
              onChange={setWholeGroup}
            />
          )}
          {cr?.kind === "PROPOSAL" && cr.mine && (
            <Notice>
              다른 시간을 제안했습니다:{" "}
              {cr.slots.map((s) => fmtRange(s.startAt, s.endAt)).join(", ")}
            </Notice>
          )}
          {mode === "reject" ? (
            <>
              <TextField
                label="거절 사유"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                variant="danger"
                onClick={() =>
                  call(
                    `/api/s/bookings/${b.id}/confirm`,
                    { accept: false, reason, wholeGroup },
                    "예약을 거절했습니다",
                  )
                }
              >
                거절하기
              </Button>
            </>
          ) : mode === "propose" ? (
            <>
              <SlotInputs
                slots={slots}
                onChange={setSlots}
                durationMs={durationMs}
                label="제안 시간"
              />
              <Button
                onClick={() =>
                  call(
                    `/api/s/bookings/${b.id}/propose`,
                    { slots },
                    "다른 시간을 제안했습니다",
                  )
                }
              >
                제안 보내기
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <Button
                onClick={() =>
                  call(
                    `/api/s/bookings/${b.id}/confirm`,
                    { accept: true, wholeGroup },
                    "예약을 수락했습니다",
                  )
                }
              >
                수락
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setMode("propose")}
                >
                  다른 시간 제안
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setMode("reject")}
                >
                  거절
                </Button>
              </div>
              <p className="text-muted text-xs">
                응답하지 않으면 수업 시작 시각에 자동 확정됩니다.
              </p>
            </div>
          )}
        </>
      )}

      {b.status === "REQUESTED" && (
        <>
          <p className="text-muted text-sm">
            트레이너의 수락을 기다리고 있습니다. 수업 12시간 전까지 응답이
            없으면 만료됩니다.
          </p>
          <Button
            variant="secondary"
            onClick={() =>
              call(
                `/api/s/bookings/${b.id}/withdraw`,
                {},
                "신청을 철회했습니다",
              )
            }
          >
            신청 철회
          </Button>
        </>
      )}

      {b.status === "CONFIRMED" && (
        <>
          {b.cancelRequestedAt && (
            <Notice>
              {fmtDateTime(b.cancelRequestedAt)}에 취소를 요청했습니다. 트레이너
              응답을 기다리는 중입니다.
            </Notice>
          )}
          {cr?.kind === "CHANGE" && !cr.mine && (
            <div className="border-line flex flex-col gap-2 rounded-lg border p-3">
              <p className="text-sm font-medium">
                트레이너의 시간 변경 요청 (수락할 때까지 원래 시간 유지)
              </p>
              {cr.slots.map((s, i) => (
                <Button
                  key={i}
                  variant="secondary"
                  onClick={() =>
                    call(
                      `/api/bookings/change-requests/${cr.id}`,
                      { action: "ACCEPT", index: i },
                      "변경을 수락했습니다",
                    )
                  }
                >
                  {fmtRange(s.startAt, s.endAt)}로 변경 수락
                </Button>
              ))}
              {mode === "counter" ? (
                <>
                  <SlotInputs
                    slots={slots}
                    onChange={setSlots}
                    durationMs={durationMs}
                    label="제안 시간"
                  />
                  <Button
                    onClick={() =>
                      call(
                        `/api/bookings/change-requests/${cr.id}`,
                        { action: "COUNTER", slots },
                        "다른 시간을 제안했습니다",
                      )
                    }
                  >
                    제안 보내기
                  </Button>
                </>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() => setMode("counter")}
                  >
                    다른 시간 제안
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() =>
                      call(
                        `/api/bookings/change-requests/${cr.id}`,
                        { action: "REJECT" },
                        "변경 요청을 거절했습니다",
                      )
                    }
                  >
                    거절
                  </Button>
                </div>
              )}
            </div>
          )}
          {cr?.kind === "CHANGE" && cr.mine && (
            <Notice>
              변경 요청 중:{" "}
              {cr.slots.map((s) => fmtRange(s.startAt, s.endAt)).join(", ")}
            </Notice>
          )}
          {!b.cancelRequestedAt && mode === "change" && (
            <>
              <SlotInputs
                slots={slots}
                onChange={setSlots}
                durationMs={durationMs}
                label="새 시간"
              />
              <Button
                onClick={() =>
                  call(
                    `/api/bookings/${b.id}/change-request`,
                    { slots },
                    "변경을 요청했습니다",
                  )
                }
              >
                변경 요청 보내기
              </Button>
            </>
          )}
          {!b.cancelRequestedAt && mode === "cancel" && (
            <>
              {preview && (
                <Notice tone={preview.deduct ? "warning" : "info"}>
                  {preview.deduct
                    ? `수업 ${preview.lateCancelHours}시간 전이 지나 지금 취소를 요청하면 1회 차감됩니다`
                    : preview.skippedReason === "NO_CONSENT"
                      ? "당일 취소에 해당하지만 수강 규칙 미동의로 차감하지 않습니다"
                      : "지금 취소를 요청하면 차감되지 않습니다"}
                  . 트레이너가 수락하면 취소됩니다.
                </Notice>
              )}
              <TextField
                label="취소 사유 (선택)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                variant="danger"
                onClick={() =>
                  call(
                    `/api/s/bookings/${b.id}/cancel-request`,
                    { reason },
                    "취소를 요청했습니다",
                  )
                }
              >
                취소 요청 보내기
              </Button>
            </>
          )}
          {!b.cancelRequestedAt && mode === "none" && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setMode("change")}
              >
                시간 변경 요청
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setMode("cancel")}
              >
                취소 요청
              </Button>
            </div>
          )}
        </>
      )}

      {b.status === "CANCELED" && (
        <p className="text-muted text-sm">
          {b.canceledBy ?? ""} 취소 ·{" "}
          {b.canceledAt ? fmtDateTime(b.canceledAt) : ""} ·{" "}
          {b.deducted
            ? "1회 차감"
            : b.deductSkippedReason === "NO_CONSENT"
              ? "미동의로 차감 안 함"
              : "차감 없음"}
        </p>
      )}
      <StudentApprovalActions b={b} call={call} />
      {b.status === "INSUFFICIENT" && (
        <Notice tone="warning">
          잔여 횟수가 부족해 이 예약을 진행할 수 없습니다. 이용권을 추가하면
          다시 확정됩니다.
        </Notice>
      )}
      {b.rejectReason && (
        <p className="text-muted text-sm">거절 사유: {b.rejectReason}</p>
      )}
    </Modal>
  );
}
