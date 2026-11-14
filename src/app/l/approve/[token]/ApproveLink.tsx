"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtRange } from "@/components/fmt";
import { Button, PasswordField, TextField } from "@/components/ui";
import { LinkShell, useLinkData } from "../../LinkShell";

interface Data {
  status: string;
  disputed: boolean;
  startAt: string;
  endAt: string;
  trainerName: string;
  registered: boolean;
  signupPrefill: { name: string; phone: string } | null;
}

/** 완료 승인 링크 (5.1): 회원은 PIN, 미가입은 가입 화면으로 */
export function ApproveLink({ token }: { token: string }) {
  const { data, error, done, act } = useLinkData<Data>(
    `/api/l/approve/${token}`,
  );
  const [pin, setPin] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const back = `/l/approve/${token}`;
  return (
    <LinkShell title="수업 완료 승인" error={error} done={done}>
      {data && (
        <>
          <p className="text-sm">{data.trainerName} 트레이너 수업</p>
          <p className="text-lg font-medium">
            {fmtRange(data.startAt, data.endAt)}
          </p>
          {data.status !== "PENDING_APPROVAL" || data.disputed ? (
            <p className="text-muted text-sm">이미 처리된 수업입니다.</p>
          ) : !data.registered ? (
            <>
              <p className="text-sm">
                수업 완료 승인은 가입한 뒤 PIN으로 할 수 있습니다.
              </p>
              <Link
                className="bg-brand-500 rounded-xl px-4 py-2.5 text-center text-sm font-semibold text-white"
                href={`/signup?role=STUDENT&name=${encodeURIComponent(data.signupPrefill?.name ?? "")}&phone=${encodeURIComponent(data.signupPrefill?.phone ?? "")}&then=${encodeURIComponent(back)}`}
              >
                가입하고 승인하기
              </Link>
            </>
          ) : rejecting ? (
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
                  act({ action: "REJECT", reason }, "완료 승인을 거절했습니다")
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
                    act({ action: "APPROVE", pin }, "수업 완료를 승인했습니다")
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
        </>
      )}
    </LinkShell>
  );
}
