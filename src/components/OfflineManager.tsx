"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { setOffline, useOffline } from "@/lib/offline/network";
import {
  clearOffline,
  getMeta,
  listQueue,
  putEncrypted,
  removeQueued,
  setMeta,
} from "@/lib/offline/store";
import { fmtDateTime } from "./fmt";

const FIVE_MIN = 5 * 60 * 1000;

/** 휴대폰 백업 (11.1): 자동 로그인 기기에서만. 실패해도 조용히 넘어간다 */
export async function runBackup(): Promise<boolean> {
  try {
    const res = await fetch("/api/offline/snapshot", {
      credentials: "same-origin",
    });
    if (res.status === 401) return false;
    if (!res.ok) return false;
    const json = (await res.json()) as {
      enabled: boolean;
      userId?: string;
      snapshot?: unknown;
    };
    if (!json.enabled) {
      await clearOffline();
      return false;
    }
    const prevUser = await getMeta<string>("userId");
    if (prevUser && prevUser !== json.userId) await clearOffline();
    await putEncrypted("snapshot", json.snapshot);
    await setMeta("userId", json.userId);
    await setMeta("lastBackupAt", new Date().toISOString());
    window.dispatchEvent(new CustomEvent("pt:backup"));
    return true;
  } catch {
    return false;
  }
}

/** 복구 후 동기화 (11.3): 임시 변경을 만든 순서대로 업로드 */
async function flushQueue(): Promise<{
  applied: number;
  conflicts: number;
  failed: string[];
} | null> {
  const ops = await listQueue();
  if (ops.length === 0) return null;
  const res = await fetch("/api/offline/sync", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ops }),
  });
  if (!res.ok) throw new Error("sync");
  const { results } = (await res.json()) as {
    results: { id: string; status: string; reason?: string }[];
  };
  await removeQueued(results.map((r) => r.id));
  return {
    applied: results.filter((r) => r.status === "APPLIED").length,
    conflicts: results.filter((r) => r.status === "CONFLICT").length,
    failed: results
      .filter((r) => r.status === "FAILED" || r.status === "PIN_FAILED")
      .map((r) => r.reason ?? ""),
  };
}

/**
 * 전역: 오프라인 배너 "오프라인 · 마지막 동기화 11/13 20:10", 동기화 중, 결과 안내.
 */
export function OfflineManager() {
  const offline = useOffline();
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{
    applied: number;
    conflicts: number;
    failed: string[];
  } | null>(null);
  const changeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setLastBackup(await getMeta<string>("lastBackupAt"));
    setQueued((await listQueue()).length);
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await flushQueue();
      if (r) setResult(r);
      await runBackup();
    } catch {
      setOffline(true);
    } finally {
      setSyncing(false);
      void refresh();
    }
  }, [refresh]);

  useEffect(() => {
    // 앱을 열 때 백업, 열려 있는 동안 5분마다
    void runBackup().then(refresh);
    const t = setInterval(() => void runBackup().then(refresh), FIVE_MIN);
    const onChanged = () => {
      if (changeTimer.current) clearTimeout(changeTimer.current);
      changeTimer.current = setTimeout(
        () => void runBackup().then(refresh),
        1500,
      );
    };
    const onQueue = () => void refresh();
    window.addEventListener("pt:changed", onChanged);
    window.addEventListener("pt:queue", onQueue);
    window.addEventListener("pt:backup", onQueue);
    return () => {
      clearInterval(t);
      window.removeEventListener("pt:changed", onChanged);
      window.removeEventListener("pt:queue", onQueue);
      window.removeEventListener("pt:backup", onQueue);
    };
  }, [refresh]);

  // 오프라인이면 서버가 돌아왔는지 주기적으로 확인
  useEffect(() => {
    if (!offline) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        if (r.ok) setOffline(false);
      } catch {
        /* 아직 오프라인 */
      }
    }, 5000);
    return () => clearInterval(t);
  }, [offline]);

  // 복구되면 임시 변경 업로드 → 백업 갱신 → 배너 닫힘
  useEffect(() => {
    // 연결이 돌아오면 동기화한다
    if (!offline)
      void listQueue().then((q) => {
        if (q.length > 0) void sync();
      });
  }, [offline, sync]);

  if (offline) {
    return (
      <div
        role="status"
        className="sticky top-0 z-40 bg-orange-500 px-4 py-1.5 text-center text-sm text-white"
      >
        오프라인 · 마지막 동기화 {lastBackup ? fmtDateTime(lastBackup) : "없음"}
        {queued > 0 && ` · 동기화 대기 ${queued}건`}
      </div>
    );
  }
  if (syncing) {
    return (
      <div
        role="status"
        className="sticky top-0 z-40 bg-amber-500 px-4 py-1.5 text-center text-sm text-white"
      >
        동기화 중…
      </div>
    );
  }
  if (result) {
    return (
      <div
        role="status"
        className="sticky top-0 z-40 bg-zinc-800 px-4 py-1.5 text-center text-sm text-white"
      >
        동기화 완료 · 반영 {result.applied}건
        {result.conflicts > 0 && (
          <>
            {" "}
            · 충돌 {result.conflicts}건{" "}
            <Link href="/t/sync-conflicts" className="underline">
              확인하기
            </Link>
          </>
        )}
        {result.failed.length > 0 && ` · ${result.failed.join(" / ")}`}
        <button
          type="button"
          className="ml-2 underline"
          onClick={() => setResult(null)}
        >
          닫기
        </button>
      </div>
    );
  }
  return null;
}

export function LastBackup() {
  const [at, setAt] = useState<string | null>(null);
  useEffect(() => {
    void getMeta<string>("lastBackupAt").then(setAt);
    const on = () => void getMeta<string>("lastBackupAt").then(setAt);
    window.addEventListener("pt:backup", on);
    return () => window.removeEventListener("pt:backup", on);
  }, []);
  return (
    <p className="text-sm text-zinc-500">
      마지막 백업: {at ? fmtDateTime(at) : "없음"}
      <span className="block text-xs">
        자동 로그인한 기기에서만 백업합니다. 앱이 열려 있을 때만 백업되며,
        iPhone은 오래 접속하지 않으면 저장 데이터가 지워질 수 있어 홈 화면
        추가를 권장합니다.
      </span>
    </p>
  );
}
