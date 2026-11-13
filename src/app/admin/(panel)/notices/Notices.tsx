"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { fmtDateTime } from "@/components/fmt";
import { Button, Card, Notice as Msg, TextField } from "@/components/ui";

interface Item {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
}

/** 공지사항 작성 (12.4). 회원은 내 정보 > 공지사항에서 봄 */
export function Notices() {
  const [items, setItems] = useState<Item[]>([]);
  const [editing, setEditing] = useState<{
    id?: string;
    title: string;
    body: string;
  }>({ title: "", body: "" });
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<{ notices: Item[] }>("/api/admin/notices");
    if (r.ok) setItems(r.data.notices);
  }, []);
  useEffect(() => {
    // 처음 열 때 불러온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await api("/api/admin/notices", { body: editing });
    if (!r.ok) return setError(r.message);
    setEditing({ title: "", body: "" });
    void load();
  }
  async function remove(id: string) {
    if (!confirm("이 공지를 삭제할까요?")) return;
    await api(`/api/admin/notices/${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">공지사항</h1>
      <Card title={editing.id ? "공지 수정" : "새 공지"}>
        <form onSubmit={save} className="flex flex-col gap-3">
          <TextField
            label="제목"
            value={editing.title}
            onChange={(e) =>
              setEditing((x) => ({ ...x, title: e.target.value }))
            }
          />
          <label className="flex flex-col gap-1 text-sm font-medium">
            내용
            <textarea
              rows={6}
              value={editing.body}
              onChange={(e) =>
                setEditing((x) => ({ ...x, body: e.target.value }))
              }
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-normal dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          {error && <Msg tone="error">{error}</Msg>}
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={!editing.title.trim() || !editing.body.trim()}
            >
              {editing.id ? "수정" : "게시"}
            </Button>
            {editing.id && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing({ title: "", body: "" })}
              >
                취소
              </Button>
            )}
          </div>
        </form>
      </Card>
      <ul className="flex flex-col gap-2">
        {items.map((n) => (
          <li
            key={n.id}
            className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800"
          >
            <p className="font-semibold">{n.title}</p>
            <p className="text-xs text-zinc-500">
              {fmtDateTime(n.publishedAt)}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
            <div className="mt-2 flex gap-3 text-xs">
              <button
                type="button"
                className="underline"
                onClick={() => setEditing(n)}
              >
                수정
              </button>
              <button
                type="button"
                className="text-red-600 underline"
                onClick={() => remove(n.id)}
              >
                삭제
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
