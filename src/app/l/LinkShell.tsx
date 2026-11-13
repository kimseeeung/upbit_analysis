"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "@/components/api";
import { Notice } from "@/components/ui";

/** 1회용 링크 화면 공통: 불러오기·오류·완료 */
export function useLinkData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<T>(url);
    if (r.ok) setData(r.data);
    else setError(r.message);
  }, [url]);
  useEffect(() => {
    // 처음 열 때 링크 내용을 불러온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const act = useCallback(
    async (body: unknown, ok: string) => {
      setError(null);
      const r = await api(url, { body });
      if (r.ok) setDone(ok);
      else setError(r.message);
    },
    [url],
  );
  return { data, error, done, act };
}

export function LinkShell({
  title,
  error,
  done,
  children,
}: {
  title: string;
  error: string | null;
  done: string | null;
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-10">
      <p className="text-sm text-zinc-500">PT 관리</p>
      <h1 className="text-xl font-semibold">{title}</h1>
      {done ? <Notice tone="success">{done}</Notice> : children}
      {error && <Notice tone="error">{error}</Notice>}
    </main>
  );
}
