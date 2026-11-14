"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/components/api";
import { PhoneVerification } from "@/components/PhoneVerification";
import {
  Button,
  Notice,
  RoleTabs,
  TextField,
  type RoleKey,
} from "@/components/ui";

export function FindIdForm() {
  const [role, setRole] = useState<RoleKey | null>(null);
  const [name, setName] = useState("");
  const [verification, setVerification] = useState<{
    verificationId: string;
    phone: string;
  } | null>(null);
  const [result, setResult] = useState<{
    maskedLoginId: string;
    joinedAt: string;
  } | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function find() {
    if (!role || !verification) return;
    setBusy(true);
    setError(null);
    const r = await api<{ maskedLoginId: string; joinedAt: string }>(
      "/api/auth/find-id",
      {
        body: { role, name, ...verification },
      },
    );
    setBusy(false);
    if (r.ok) setResult(r.data);
    else setError(r.message);
  }

  async function sendFull() {
    if (!role || !verification) return;
    setBusy(true);
    const r = await api("/api/auth/find-id/send-full", {
      body: { role, name, ...verification },
    });
    setBusy(false);
    if (r.ok) setSent(true);
    else setError(r.message);
  }

  if (result) {
    const joined = new Date(result.joinedAt).toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul",
    });
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="success">
          아이디: <strong>{result.maskedLoginId}</strong> (가입일 {joined})
        </Notice>
        {sent ? (
          <Notice>전체 아이디를 문자로 보냈습니다.</Notice>
        ) : (
          <Button variant="secondary" disabled={busy} onClick={sendFull}>
            전체 아이디 문자로 받기
          </Button>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <Link
          href="/login"
          className="text-muted text-center text-sm underline"
        >
          로그인하러 가기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <RoleTabs value={role} onChange={setRole} />
      <TextField
        label="이름"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <PhoneVerification purpose="FIND_ID" onVerified={setVerification} />
      {error && <Notice tone="error">{error}</Notice>}
      <Button
        disabled={busy || !role || !name.trim() || !verification}
        onClick={find}
      >
        아이디 찾기
      </Button>
    </div>
  );
}
