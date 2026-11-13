"use client";

import { useState } from "react";
import { fmtRange } from "@/components/fmt";
import { Button, TextField } from "@/components/ui";
import { LinkShell, useLinkData } from "../../LinkShell";

interface Data {
  status: string;
  startAt: string;
  endAt: string;
  trainerName: string;
  studentName: string;
}

/** 예약 응답 (가입 불필요, 4.4) */
export function ConfirmLink({ token }: { token: string }) {
  const { data, error, done, act } = useLinkData<Data>(
    `/api/l/confirm/${token}`,
  );
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  return (
    <LinkShell title="예약 확정 요청" error={error} done={done}>
      {data && (
        <>
          <p className="text-sm">
            {data.studentName}님, {data.trainerName} 트레이너가 수업을
            등록했습니다.
          </p>
          <p className="text-lg font-medium">
            {fmtRange(data.startAt, data.endAt)}
          </p>
          {data.status !== "PENDING_CONFIRM" ? (
            <p className="text-sm text-zinc-500">
              이미 응답했거나 바뀐 예약입니다.
            </p>
          ) : rejecting ? (
            <>
              <TextField
                label="거절 사유"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                variant="danger"
                onClick={() =>
                  act({ accept: false, reason }, "예약을 거절했습니다")
                }
              >
                거절하기
              </Button>
            </>
          ) : (
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => act({ accept: true }, "예약을 수락했습니다")}
              >
                수락
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setRejecting(true)}
              >
                거절
              </Button>
            </div>
          )}
          <p className="text-xs text-zinc-500">
            응답하지 않으면 수업 시작 시각에 자동 확정됩니다. 다른 시간을 원하면
            트레이너에게 알려 주세요.
          </p>
        </>
      )}
    </LinkShell>
  );
}
