"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { fmtDateTime } from "@/components/fmt";
import { Button, Checkbox, Notice } from "@/components/ui";

interface Item {
  id: string;
  title: string;
  body: string;
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
  userName: string;
  userRole: string;
}
const ROLE: Record<string, string> = {
  TRAINER: "트레이너",
  STUDENT: "수강생",
  CENTER_ADMIN: "센터 관리자",
};

/** 문의 답변 (12.4) */
export function Inquiries() {
  const [items, setItems] = useState<Item[]>([]);
  const [unanswered, setUnanswered] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<{ inquiries: Item[] }>(
      `/api/admin/inquiries${unanswered ? "?unanswered=1" : ""}`,
    );
    if (r.ok) setItems(r.data.inquiries);
  }, [unanswered]);
  useEffect(() => {
    // 필터가 바뀌면 다시 불러온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function answer(id: string) {
    setError(null);
    const r = await api(`/api/admin/inquiries/${id}`, {
      body: { answer: drafts[id] ?? "" },
    });
    if (!r.ok) return setError(r.message);
    void load();
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">문의</h1>
      <Checkbox
        label="답변 전만 보기"
        checked={unanswered}
        onChange={setUnanswered}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <ul className="flex flex-col gap-2">
        {items.map((q) => (
          <li
            key={q.id}
            className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800"
          >
            <p className="font-semibold">{q.title}</p>
            <p className="text-xs text-zinc-500">
              {q.userName} ({ROLE[q.userRole]}) · {fmtDateTime(q.createdAt)}
            </p>
            <p className="whitespace-pre-wrap">{q.body}</p>
            {q.answer ? (
              <p className="rounded bg-zinc-100 p-2 whitespace-pre-wrap dark:bg-zinc-800">
                답변 ({q.answeredAt ? fmtDateTime(q.answeredAt) : ""}):{" "}
                {q.answer}
              </p>
            ) : (
              <>
                <textarea
                  aria-label="답변"
                  rows={3}
                  value={drafts[q.id] ?? ""}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [q.id]: e.target.value }))
                  }
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                />
                <Button
                  disabled={!(drafts[q.id] ?? "").trim()}
                  onClick={() => answer(q.id)}
                >
                  답변 등록
                </Button>
              </>
            )}
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-zinc-500">문의가 없습니다</li>
        )}
      </ul>
    </div>
  );
}
