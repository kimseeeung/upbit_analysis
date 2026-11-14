"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { fmtDateTime } from "@/components/fmt";
import { Button, Card, Notice, TextField } from "@/components/ui";

interface Item {
  id: string;
  title: string;
  body: string;
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
}

export function MyInquiries() {
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);
  const load = useCallback(async () => {
    const r = await api<{ inquiries: Item[] }>("/api/me/inquiries");
    if (r.ok) setItems(r.data.inquiries);
  }, []);
  useEffect(() => {
    // 처음 열 때 불러온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await api("/api/me/inquiries", { body: { title, body } });
    if (!r.ok) return setMsg({ tone: "error", text: r.message });
    setMsg({
      tone: "success",
      text: "문의를 보냈습니다. 답변이 등록되면 알려 드립니다",
    });
    setTitle("");
    setBody("");
    void load();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="새 문의">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <TextField
            label="제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="flex flex-col gap-1 text-sm font-medium">
            내용
            <textarea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="border-line bg-surface rounded-lg border px-3 py-2 font-normal"
            />
          </label>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <Button type="submit" disabled={!title.trim() || !body.trim()}>
            보내기
          </Button>
        </form>
      </Card>
      <ul className="flex flex-col gap-2">
        {items.map((q) => (
          <li
            key={q.id}
            className="border-line bg-surface rounded-2xl border p-3 text-sm"
          >
            <p className="font-medium">{q.title}</p>
            <p className="text-muted text-xs">
              {fmtDateTime(q.createdAt)} ·{" "}
              {q.answer ? "답변 완료" : "답변 대기"}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{q.body}</p>
            {q.answer && (
              <p className="bg-brand-50 dark:bg-brand-700/20 mt-2 rounded p-2 whitespace-pre-wrap">
                답변: {q.answer}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
