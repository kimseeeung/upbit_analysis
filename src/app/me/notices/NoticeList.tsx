"use client";

import { Loading } from "@/components/ui";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { fmtDateTime } from "@/components/fmt";

interface Item {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
}

export function NoticeList() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    void api<{ notices: Item[] }>("/api/me/notices").then(
      (r) => r.ok && setItems(r.data.notices),
    );
  }, []);
  if (!items) return <Loading />;
  if (items.length === 0)
    return <p className="text-muted text-sm">공지사항이 없습니다</p>;
  return (
    <ul className="divide-line flex flex-col divide-y">
      {items.map((n) => (
        <li key={n.id} className="py-2">
          <button
            type="button"
            className="w-full text-left"
            onClick={() => setOpen(open === n.id ? null : n.id)}
          >
            <p className="text-sm font-medium">{n.title}</p>
            <p className="text-muted text-xs">{fmtDateTime(n.publishedAt)}</p>
          </button>
          {open === n.id && (
            <p className="mt-2 text-sm whitespace-pre-wrap">{n.body}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
