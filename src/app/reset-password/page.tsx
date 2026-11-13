"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/components/api";
import { PhoneVerification } from "@/components/PhoneVerification";
import {
  Button,
  Notice,
  PageShell,
  PasswordField,
  TextField,
} from "@/components/ui";
import { validatePassword } from "@/lib/auth/policy";

export default function ResetPasswordPage() {
  const [loginId, setLoginId] = useState("");
  const [verification, setVerification] = useState<{
    verificationId: string;
    phone: string;
  } | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const policy = pw ? validatePassword(pw, loginId) : null;

  async function submit() {
    if (!verification) return;
    setBusy(true);
    setError(null);
    const r = await api("/api/auth/reset-password", {
      body: {
        loginId: loginId.trim(),
        ...verification,
        newPassword: pw,
        newPasswordConfirm: pw2,
      },
    });
    setBusy(false);
    if (r.ok) setDone(true);
    else setError(r.message);
  }

  return (
    <PageShell
      title="비밀번호 재설정"
      back={{ href: "/login", label: "로그인" }}
    >
      {done ? (
        <div className="flex flex-col gap-4">
          <Notice tone="success">
            비밀번호를 바꿨습니다. 보안을 위해 모든 기기에서 로그아웃했습니다.
          </Notice>
          <Link href="/login" className="text-center text-sm underline">
            새 비밀번호로 로그인
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <TextField
            label="아이디"
            autoCapitalize="none"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value.toLowerCase())}
          />
          <PhoneVerification purpose="RESET_PW" onVerified={setVerification} />
          {verification && (
            <>
              <PasswordField
                label="새 비밀번호"
                autoComplete="new-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                hint="8~20자, 영문·숫자·특수문자 모두 포함. 직전 비밀번호는 쓸 수 없습니다"
                error={policy && !policy.ok ? policy.message : null}
              />
              <PasswordField
                label="새 비밀번호 확인"
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                error={
                  pw2 && pw !== pw2 ? "비밀번호 확인이 일치하지 않습니다" : null
                }
              />
            </>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <Button
            disabled={
              busy || !verification || !policy?.ok || pw !== pw2 || !loginId
            }
            onClick={submit}
          >
            비밀번호 바꾸기
          </Button>
        </div>
      )}
    </PageShell>
  );
}
