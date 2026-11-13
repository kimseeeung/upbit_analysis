"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { Button, Notice, PasswordField, TextField } from "@/components/ui";

/** 아이디·비밀번호·롤백 PIN(6자리) 직접 설정 → 초대받은 휴대폰 인증 → 활성화 (12.2) */
export function InviteAccept({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<{
    name: string;
    phoneHint: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [pin, setPin] = useState("");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ name: string; phoneHint: string }>(
      `/api/admin/invite/${token}`,
    ).then((r) => (r.ok ? setInvite(r.data) : setError(r.message)));
  }, [token]);

  if (!invite)
    return error ? (
      <Notice tone="error">{error}</Notice>
    ) : (
      <p className="text-sm">불러오는 중…</p>
    );

  async function sendCode() {
    setError(null);
    const r = await api<{ verificationId: string }>(
      `/api/admin/invite/${token}/sms`,
      { body: {} },
    );
    if (!r.ok) return setError(r.message);
    setVerificationId(r.data.verificationId);
  }
  async function verify() {
    setError(null);
    const r = await api(`/api/admin/invite/${token}/verify`, {
      body: { verificationId, code },
    });
    if (!r.ok) return setError(r.message);
    setVerified(true);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== password2) return setError("비밀번호가 서로 다릅니다");
    setBusy(true);
    setError(null);
    const r = await api<{ next: string }>(`/api/admin/invite/${token}`, {
      body: { loginId, password, rollbackPin: pin, verificationId },
    });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    router.replace(r.data.next);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm">{invite.name}님, 운영 관리자로 초대되었습니다.</p>
      <TextField
        label="아이디"
        value={loginId}
        onChange={(e) => setLoginId(e.target.value)}
      />
      <PasswordField
        label="비밀번호"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <PasswordField
        label="비밀번호 확인"
        autoComplete="new-password"
        value={password2}
        onChange={(e) => setPassword2(e.target.value)}
      />
      <PasswordField
        label="롤백 PIN (숫자 6자리)"
        inputMode="numeric"
        maxLength={6}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
      />
      <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="text-sm">휴대폰 인증 ({invite.phoneHint})</p>
        {verified ? (
          <Notice tone="success">인증되었습니다</Notice>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={sendCode}>
              {verificationId ? "인증번호 다시 받기" : "인증번호 받기"}
            </Button>
            {verificationId && (
              <>
                <TextField
                  label="인증번호"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={verify}
                  disabled={code.length !== 6}
                >
                  인증 확인
                </Button>
              </>
            )}
          </>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <Button
        type="submit"
        disabled={
          busy || !verified || !loginId || !password || pin.length !== 6
        }
      >
        활성화
      </Button>
    </form>
  );
}
