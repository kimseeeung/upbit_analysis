"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { Button, Notice, TextField } from "./ui";

export type SmsPurpose =
  "SIGNUP" | "FIND_ID" | "RESET_PW" | "RESET_PIN" | "CHANGE_PHONE" | "WITHDRAW";

/**
 * 전화번호 본인인증 (명세 1.2). 가입·아이디 찾기·비밀번호 재설정·PIN 재설정·
 * 전화번호 변경·탈퇴에서 같은 화면을 쓴다.
 */
export function PhoneVerification({
  purpose,
  initialPhone = "",
  phoneLocked = false,
  onVerified,
}: {
  purpose: SmsPurpose;
  initialPhone?: string;
  phoneLocked?: boolean;
  onVerified: (r: { verificationId: string; phone: string }) => void;
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState("");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [resendAt, setResendAt] = useState<number>(0);
  // 렌더 중에는 현재 시각을 읽지 않는다(프리렌더 규칙). 인증번호를 보낼 때 채운다
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!verificationId || verified) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [verificationId, verified]);

  const remainingSec = expiresAt
    ? Math.max(0, Math.ceil((expiresAt - now) / 1000))
    : 0;
  const resendSec = Math.max(0, Math.ceil((resendAt - now) / 1000));

  async function send() {
    setBusy(true);
    setError(null);
    setInfo(null);
    const r = await api<{
      verificationId: string;
      expiresAt: string;
      resendAfterSec: number;
      testCode?: string;
    }>("/api/auth/sms/send", { body: { phone, purpose } });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setVerificationId(r.data.verificationId);
    setExpiresAt(new Date(r.data.expiresAt).getTime());
    setResendAt(Date.now() + r.data.resendAfterSec * 1000);
    setNow(Date.now());
    // 테스트 모드(실제 문자 미발송): 인증번호 000000을 미리 채운다
    setCode(r.data.testCode ?? "");
    setInfo(
      r.data.testCode
        ? `테스트 모드: 문자를 보내지 않습니다. 인증번호 ${r.data.testCode}을 입력해 두었으니 확인을 누르세요`
        : "인증번호를 보냈습니다. 3분 안에 입력해 주세요",
    );
  }

  async function verify() {
    if (!verificationId) return;
    setBusy(true);
    setError(null);
    const r = await api("/api/auth/sms/verify", {
      body: { verificationId, code },
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setVerified(true);
    setInfo(null);
    onVerified({ verificationId, phone });
  }

  const mm = String(Math.floor(remainingSec / 60));
  const ss = String(remainingSec % 60).padStart(2, "0");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <TextField
          className="flex-1"
          label="휴대폰 번호"
          inputMode="tel"
          autoComplete="tel"
          placeholder="010-0000-0000"
          value={phone}
          disabled={phoneLocked || verified}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Button
          variant="secondary"
          disabled={busy || verified || !phone || resendSec > 0}
          onClick={send}
        >
          {verificationId
            ? resendSec > 0
              ? `재발송 ${resendSec}초`
              : "다시 받기"
            : "인증번호 받기"}
        </Button>
      </div>
      {verificationId && !verified && (
        <div className="flex items-end gap-2">
          <TextField
            className="flex-1"
            label="인증번호"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6자리"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            hint={
              remainingSec > 0
                ? `남은 시간 ${mm}:${ss}`
                : "인증 시간이 지났습니다. 다시 받아 주세요"
            }
          />
          <Button
            disabled={busy || code.length !== 6 || remainingSec === 0}
            onClick={verify}
          >
            확인
          </Button>
        </div>
      )}
      {verified && <Notice tone="success">인증 완료</Notice>}
      {info && <Notice>{info}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
