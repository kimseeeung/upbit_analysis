"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { useOffline } from "@/lib/offline/network";
import {
  Button,
  Checkbox,
  Notice,
  PasswordField,
  RoleTabs,
  TextField,
  type RoleKey,
} from "@/components/ui";

const SAVED_ID_KEY = "pt.savedLoginId";
const SAVED_ROLE_KEY = "pt.savedRole";

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* 저장 안 되는 브라우저 */
  }
}

/** next 파라미터는 같은 사이트 안의 경로만 허용 */
function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export function LoginForm() {
  const offline = useOffline();
  const router = useRouter();
  const params = useSearchParams();
  const [role, setRole] = useState<RoleKey | null>(null);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [saveId, setSaveId] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = readLocal(SAVED_ID_KEY);
    const savedRole = readLocal(SAVED_ROLE_KEY) as RoleKey | null;
    // 브라우저 저장소는 화면이 뜬 뒤에만 읽을 수 있다
    /* eslint-disable react-hooks/set-state-in-effect */
    if (saved) {
      setLoginId(saved);
      setSaveId(true);
    }
    if (savedRole) setRole(savedRole);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!role) {
      setError("회원 유형을 선택해 주세요");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await api<{ next: string }>("/api/auth/login", {
      body: { role, loginId: loginId.trim(), password, remember },
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    writeLocal(SAVED_ID_KEY, saveId ? loginId.trim() : null);
    writeLocal(SAVED_ROLE_KEY, saveId ? role : null);
    const next = safeNext(params.get("next"));
    router.replace(
      r.data.next === "/terms/reconsent" ? r.data.next : (next ?? r.data.next),
    );
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {offline && (
        <Notice tone="warning">
          오프라인에서는 로그인할 수 없습니다. 연결되면 다시 시도해 주세요
        </Notice>
      )}
      <RoleTabs value={role} onChange={setRole} />
      <TextField
        label="아이디"
        autoComplete="username"
        autoCapitalize="none"
        value={loginId}
        onChange={(e) => setLoginId(e.target.value)}
      />
      <PasswordField
        label="비밀번호"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="flex flex-col gap-2">
        <Checkbox label="아이디 저장" checked={saveId} onChange={setSaveId} />
        <Checkbox
          label="자동 로그인"
          checked={remember}
          onChange={setRemember}
        />
        {remember && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            공용 기기에서는 사용하지 마세요. 30일 동안 로그인이 유지됩니다.
          </p>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={busy || !loginId || !password || offline}>
        로그인
      </Button>
      <div className="text-muted flex justify-center gap-4 text-sm">
        <Link href="/find-id">아이디 찾기</Link>
        <Link href="/reset-password">비밀번호 재설정</Link>
        <Link href="/signup">회원가입</Link>
      </div>
    </form>
  );
}
