"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/api";
import { Button, Notice, PasswordField, TextField } from "@/components/ui";

/** 2단계 로그인: 비밀번호 → 등록된 휴대폰 인증 (12.1). 자동 로그인 없음 */
export function AdminLoginForm() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<{
    token: string;
    hint: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function step1(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api<{ challengeToken: string; phoneHint: string }>(
      "/api/admin/login",
      {
        body: { loginId, password },
      },
    );
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setChallenge({ token: r.data.challengeToken, hint: r.data.phoneHint });
    setPassword("");
  }

  async function step2(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError(null);
    const r = await api<{ next: string }>("/api/admin/login/verify", {
      body: { challengeToken: challenge.token, code },
    });
    setBusy(false);
    if (!r.ok) {
      if (r.code === "CHALLENGE_EXPIRED" || r.code === "LOCKED")
        setChallenge(null);
      return setError(r.message);
    }
    router.replace(r.data.next);
  }

  if (challenge)
    return (
      <form onSubmit={step2} className="flex flex-col gap-3">
        <p className="text-muted text-sm">
          등록된 휴대폰(끝자리 {challenge.hint})으로 보낸 인증번호를 입력해
          주세요.
        </p>
        <TextField
          label="인증번호"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={busy || code.length !== 6}>
          확인
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setChallenge(null)}
        >
          처음부터
        </Button>
      </form>
    );
  return (
    <form onSubmit={step1} className="flex flex-col gap-3">
      <TextField
        label="아이디"
        autoComplete="username"
        value={loginId}
        onChange={(e) => setLoginId(e.target.value)}
      />
      <PasswordField
        label="비밀번호"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={busy || !loginId || !password}>
        다음
      </Button>
      <p className="text-muted text-xs">
        5회 실패하면 30분 동안 잠깁니다. 30분 동안 쓰지 않으면 로그아웃됩니다.
      </p>
    </form>
  );
}
