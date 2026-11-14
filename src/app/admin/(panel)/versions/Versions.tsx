"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { fmtDateTime } from "@/components/fmt";
import {
  Button,
  Card,
  Modal,
  Notice,
  PageHeader,
  PasswordField,
  TextField,
} from "@/components/ui";

interface Version {
  version: string;
  deployedAt: string;
  deployedBy: string;
  summary: string;
  isCurrent: boolean;
}
interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}
interface Log {
  id: string;
  fromVersion: string;
  toVersion: string;
  reason: string;
  startedAt: string;
  finishedAt: string | null;
  result: "RUNNING" | "SUCCEEDED" | "FAILED";
  healthCheck: Check[] | null;
  error: string | null;
  operator: { name: string };
}
interface Data {
  versions: Version[];
  previous: string | null;
  latest: string | null;
  rollbacks: Log[];
}

const RESULT = {
  RUNNING: "진행 중",
  SUCCEEDED: "완료 · 점검 통과",
  FAILED: "실패",
};

/** 버전 목록·롤백 (12.3) */
export function Versions() {
  const [data, setData] = useState<Data | null>(null);
  const [target, setTarget] = useState<Version | null>(null);
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Log | null>(null);

  const load = useCallback(async () => {
    const r = await api<Data>("/api/admin/versions");
    if (r.ok) setData(r.data);
  }, []);
  useEffect(() => {
    // 처음 열 때 불러온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function open(v: Version) {
    setTarget(v);
    setPin("");
    setReason("");
    setError(null);
    setResult(null);
  }
  async function run() {
    if (!target) return;
    setRunning(true);
    setError(null);
    const r = await api<{ log: Log }>("/api/admin/rollback", {
      body: { toVersion: target.version, pin, reason },
    });
    setRunning(false);
    setPin("");
    if (!r.ok) return setError(r.message);
    setResult(r.data.log);
    void load();
  }

  if (!data) return <p className="text-muted text-sm">불러오는 중…</p>;
  const current = data.versions.find((v) => v.isCurrent);
  const byVersion = (v: string | null) =>
    data.versions.find((x) => x.version === v);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="버전·롤백" />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!data.previous}
          onClick={() => open(byVersion(data.previous)!)}
        >
          직전 버전으로 롤백{data.previous ? ` (${data.previous})` : ""}
        </Button>
        {data.latest && (
          <Button
            variant="secondary"
            onClick={() => open(byVersion(data.latest)!)}
          >
            다시 최신 버전으로 ({data.latest})
          </Button>
        )}
      </div>
      <Card title="배포 버전" icon="history" count={data.versions.length}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-line border-b text-left">
                <th className="px-2 py-2">버전</th>
                <th className="px-2 py-2">배포 일시</th>
                <th className="px-2 py-2">배포한 사람</th>
                <th className="px-2 py-2">변경 요약</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.versions.map((v) => (
                <tr
                  key={v.version}
                  className={`border-line border-b ${v.isCurrent ? "bg-emerald-50 font-semibold dark:bg-emerald-950" : ""}`}
                >
                  <td className="px-2 py-2">
                    {v.version}
                    {v.isCurrent && (
                      <span className="ml-1 text-xs text-emerald-700">
                        지금 버전
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2">{fmtDateTime(v.deployedAt)}</td>
                  <td className="px-2 py-2">{v.deployedBy}</td>
                  <td className="px-2 py-2">{v.summary || "-"}</td>
                  <td className="px-2 py-2">
                    {!v.isCurrent && (
                      <button
                        type="button"
                        className="underline"
                        onClick={() => open(v)}
                      >
                        이 버전으로
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {data.versions.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted px-2 py-6 text-center">
                    배포 기록이 없습니다 (APP_VERSION 환경 변수로 기록)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="롤백 기록">
        <ul className="flex flex-col gap-2 text-sm">
          {data.rollbacks.map((l) => (
            <li key={l.id} className="border-line border-b pb-2">
              <p>
                {fmtDateTime(l.startedAt)} · {l.operator.name} · {l.fromVersion}{" "}
                → {l.toVersion} ·{" "}
                <span className={l.result === "FAILED" ? "text-rose-600" : ""}>
                  {RESULT[l.result]}
                </span>
              </p>
              <p className="text-muted text-xs">
                사유: {l.reason}
                {l.healthCheck &&
                  ` · 점검: ${l.healthCheck.map((c) => `${c.name} ${c.ok ? "정상" : "실패"}`).join(", ")}`}
                {l.error && ` · 오류: ${l.error}`}
              </p>
            </li>
          ))}
          {data.rollbacks.length === 0 && (
            <li className="text-muted">롤백 기록이 없습니다</li>
          )}
        </ul>
      </Card>

      {target && (
        <Modal title="롤백 확인" onClose={() => !running && setTarget(null)}>
          {result ? (
            <div className="flex flex-col gap-3 text-sm">
              <Notice
                tone={result.result === "SUCCEEDED" ? "success" : "error"}
              >
                {result.fromVersion} → {result.toVersion}{" "}
                {RESULT[result.result]}
              </Notice>
              <ul aria-label="점검 결과" className="flex flex-col gap-1">
                {(result.healthCheck ?? []).map((c) => (
                  <li key={c.name}>
                    {c.ok ? "✅" : "❌"} {c.name}
                    {c.detail ? ` · ${c.detail}` : ""}
                  </li>
                ))}
              </ul>
              {result.error && (
                <p className="text-rose-600">오류: {result.error}</p>
              )}
              <Button onClick={() => setTarget(null)}>닫기</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <p>
                {current?.version ?? "-"} → <strong>{target.version}</strong>
              </p>
              <p className="text-muted">변경 내용: {target.summary || "-"}</p>
              <p className="text-muted text-xs">
                프로그램만 되돌리고 데이터는 그대로입니다. 진행하는 동안
                사용자에게 &quot;잠시 점검 중&quot;이 보입니다.
              </p>
              <PasswordField
                label="롤백 PIN"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              />
              <TextField
                label="사유"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {error && <Notice tone="error">{error}</Notice>}
              {running && <Notice>재배포하고 주요 기능을 점검하는 중…</Notice>}
              <Button
                variant="danger"
                disabled={
                  running || pin.length !== 6 || reason.trim().length < 2
                }
                onClick={run}
              >
                롤백 실행
              </Button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
