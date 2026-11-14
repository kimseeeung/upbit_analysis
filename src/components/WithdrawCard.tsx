"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api";
import { PhoneVerification } from "./PhoneVerification";
import { Button, Card, Modal, Notice, PasswordField, TextField } from "./ui";

interface Preview {
  role: "TRAINER" | "STUDENT" | "CENTER_ADMIN";
  remainingPasses: number;
  upcomingBookings: number;
  linkedStudents: number;
  blockedByCenter: string | null;
}

/** 회원 탈퇴 (2.4) */
export function WithdrawCard() {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [password, setPassword] = useState("");
  const [useSms, setUseSms] = useState(false);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    const r = await api<Preview>("/api/me/withdraw");
    if (r.ok) setPreview(r.data);
    else setError(r.message);
  }
  async function submit() {
    setError(null);
    const r = await api<{ message: string }>("/api/me/withdraw", {
      body: { password: useSms ? null : password, verificationId, reason },
    });
    if (r.ok) setDone(r.data.message);
    else setError(r.message);
  }

  return (
    <Card title="회원 탈퇴">
      {!preview ? (
        <Button variant="ghost" onClick={open}>
          회원 탈퇴
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-muted text-sm">
            탈퇴하면 개인정보와{" "}
            {preview.role === "STUDENT"
              ? "본인 기록(예약, 승인 이력, 메모, 이용권)"
              : "계정 정보"}
            이 삭제되고, 같은 아이디로 다시 가입할 수 없습니다.
          </p>
          {preview.blockedByCenter && (
            <Notice tone="error">
              {preview.blockedByCenter}의 마지막 관리자입니다. 다른 관리자를
              지정하거나 센터를 해산한 뒤 탈퇴할 수 있습니다.
            </Notice>
          )}
          {(preview.remainingPasses > 0 ||
            preview.upcomingBookings > 0 ||
            preview.linkedStudents > 0) && (
            <Notice tone="warning">
              {preview.role === "TRAINER"
                ? `연결된 수강생 ${preview.linkedStudents}명, 예정 수업 ${preview.upcomingBookings}건이 있습니다. 예정 수업은 차감 없이 취소되고 수강생에게 선택을 요청합니다.`
                : `남은 이용권 ${preview.remainingPasses}개, 예정 수업 ${preview.upcomingBookings}건이 있습니다. 예정 수업은 차감 없이 취소됩니다.`}
            </Notice>
          )}
          {useSms ? (
            <PhoneVerification
              purpose="WITHDRAW"
              onVerified={(v) => setVerificationId(v.verificationId)}
            />
          ) : (
            <PasswordField
              label="비밀번호"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
          <Button variant="ghost" onClick={() => setUseSms((v) => !v)}>
            {useSms ? "비밀번호로 확인" : "본인인증으로 확인"}
          </Button>
          <TextField
            label="탈퇴 사유 (선택)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && <Notice tone="error">{error}</Notice>}
          <Button
            variant="danger"
            disabled={
              !!preview.blockedByCenter ||
              (useSms ? !verificationId : !password)
            }
            onClick={submit}
          >
            탈퇴 신청
          </Button>
        </div>
      )}
      {done && (
        <Modal title="탈퇴 신청 완료" onClose={() => router.replace("/")}>
          <p className="text-sm">{done}</p>
          <Button onClick={() => router.replace("/")}>확인</Button>
        </Modal>
      )}
    </Card>
  );
}
