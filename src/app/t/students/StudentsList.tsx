"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { Button, Card, Notice, TextField } from "@/components/ui";

interface Row {
  studentId: string;
  name: string;
  phoneMasked: string;
  registered: boolean;
  status: "ACTIVE" | "EXPIRED" | "STOPPED";
  remaining: number;
  availableToday: number;
  nextExpiry: string | null;
  ruleUnagreed: boolean;
}

interface Hit {
  studentId: string;
  name: string;
  phoneMasked: string;
  linkedToMe: boolean;
  hasTrainer: boolean;
  requestPending: boolean;
}

const FILTERS = [
  { key: "ALL", label: "전체" },
  { key: "ACTIVE", label: "수강 중" },
  { key: "EXPIRED", label: "만료" },
  { key: "STOPPED", label: "중단" },
] as const;

const STATUS_LABEL = {
  ACTIVE: "수강 중",
  EXPIRED: "만료",
  STOPPED: "중단",
} as const;

function AddStudent({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"search" | "temp">("search");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  async function search() {
    const r = await api<{ students: Hit[] }>(
      `/api/t/students/search?q=${encodeURIComponent(q)}`,
    );
    if (r.ok) setHits(r.data.students);
  }
  async function request(studentId: string) {
    const r = await api("/api/t/students/link-requests", {
      body: { studentId },
    });
    setMsg(
      r.ok
        ? { tone: "success", text: "연결 동의 요청을 보냈습니다" }
        : { tone: "error", text: r.message },
    );
    if (r.ok) void search();
  }
  async function registerTemp() {
    const r = await api("/api/t/students/temporary", { body: { name, phone } });
    setMsg(
      r.ok
        ? { tone: "success", text: "임시 등록했습니다" }
        : { tone: "error", text: r.message },
    );
    if (r.ok) {
      setName("");
      setPhone("");
      onDone();
    }
  }

  return (
    <Card title="수강생 등록">
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={mode === "search" ? "primary" : "secondary"}
          onClick={() => setMode("search")}
        >
          가입 수강생 불러오기
        </Button>
        <Button
          variant={mode === "temp" ? "primary" : "secondary"}
          onClick={() => setMode("temp")}
        >
          미가입 수강생 임시 등록
        </Button>
      </div>
      {mode === "search" ? (
        <>
          <div className="flex items-end gap-2">
            <TextField
              className="flex-1"
              label="이름 또는 전화번호"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <Button
              variant="secondary"
              onClick={search}
              disabled={q.trim().length < 2}
            >
              검색
            </Button>
          </div>
          <ul className="flex flex-col divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            {hits.map((h) => (
              <li
                key={h.studentId}
                className="flex items-center justify-between py-2"
              >
                <span>
                  {h.name}{" "}
                  <span className="text-zinc-500">{h.phoneMasked}</span>
                </span>
                {h.linkedToMe ? (
                  <span className="text-xs text-zinc-500">연결됨</span>
                ) : h.hasTrainer ? (
                  <span className="text-xs text-zinc-500">
                    다른 트레이너 담당
                  </span>
                ) : h.requestPending ? (
                  <span className="text-xs text-zinc-500">요청 보냄</span>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => request(h.studentId)}
                  >
                    연결 요청
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <TextField
            label="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            label="전화번호"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            hint="수강생이 이 번호로 가입하면 기록을 합칠지 묻습니다"
          />
          <Button
            onClick={registerTemp}
            disabled={!name.trim() || !phone.trim()}
          >
            임시 등록
          </Button>
        </>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </Card>
  );
}

export function StudentsList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("ALL");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ students: Row[] }>(
      `/api/t/students?filter=${filter}&q=${encodeURIComponent(q)}`,
    );
    if (r.ok) setRows(r.data.students);
  }, [filter, q]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">수강생</h1>
        <Button variant="secondary" onClick={() => setAdding((v) => !v)}>
          {adding ? "닫기" : "수강생 등록"}
        </Button>
      </div>
      {adding && <AddStudent onDone={load} />}
      <TextField
        label="이름 검색"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="flex gap-1" role="tablist" aria-label="상태">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-sm ${
              filter === f.key
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 dark:bg-zinc-800"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {rows?.length === 0 && (
        <p className="text-sm text-zinc-500">수강생이 없습니다.</p>
      )}
      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {rows?.map((s) => (
          <li key={s.studentId}>
            <Link
              href={`/t/students/${s.studentId}`}
              className="flex items-center justify-between gap-2 py-3"
            >
              <span className="flex flex-col">
                <span className="font-medium">
                  {s.name}
                  {!s.registered && (
                    <span className="ml-1 text-xs text-zinc-500">미가입</span>
                  )}
                  {s.ruleUnagreed && (
                    <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                      규칙 미동의
                    </span>
                  )}
                </span>
                <span className="text-xs text-zinc-500">
                  {STATUS_LABEL[s.status]} · 잔여 {s.remaining}회
                  {s.nextExpiry ? ` · 만료 ${s.nextExpiry}` : ""}
                </span>
              </span>
              <span className="text-zinc-400">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
