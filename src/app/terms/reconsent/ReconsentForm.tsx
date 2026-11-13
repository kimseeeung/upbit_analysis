"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { Button, Checkbox, Notice } from "@/components/ui";

interface PendingTerms {
  kind: string;
  title: string;
  version: string;
  body: string;
}

export function ReconsentForm() {
  const router = useRouter();
  const [terms, setTerms] = useState<PendingTerms[] | null>(null);
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ terms: PendingTerms[] }>("/api/me/terms").then((r) => {
      if (r.ok) setTerms(r.data.terms);
      else setError(r.message);
    });
  }, []);

  async function submit() {
    const r = await api<{ next: string }>("/api/me/terms", {
      body: { consents: agreed },
    });
    if (r.ok) {
      router.replace(r.data.next);
      router.refresh();
    } else setError(r.message);
  }

  if (!terms) return error ? <Notice tone="error">{error}</Notice> : null;
  if (terms.length === 0) {
    return <Button onClick={() => router.replace("/")}>계속하기</Button>;
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        약관이 바뀌었습니다. 내용을 확인하고 동의해 주세요.
      </p>
      {terms.map((t) => (
        <div key={t.kind} className="flex flex-col gap-2">
          <p className="max-h-40 overflow-y-auto rounded-lg bg-zinc-100 p-3 text-xs whitespace-pre-line dark:bg-zinc-800">
            {t.body}
          </p>
          <Checkbox
            label={`${t.title} (필수, ${t.version})`}
            checked={!!agreed[t.kind]}
            onChange={(v) => setAgreed((a) => ({ ...a, [t.kind]: v }))}
          />
        </div>
      ))}
      {error && <Notice tone="error">{error}</Notice>}
      <Button disabled={!terms.every((t) => agreed[t.kind])} onClick={submit}>
        동의하고 계속하기
      </Button>
    </div>
  );
}
