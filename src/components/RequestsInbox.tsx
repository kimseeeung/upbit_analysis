"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { RulesLines } from "./RulesEditor";
import { Button, Card, Notice, TextField } from "./ui";

interface Inbox {
  linkRequests: {
    id: string;
    fromName: string;
    fromRole: "TRAINER" | "STUDENT" | "CENTER_ADMIN";
    fromPhoneMasked: string;
    workplace: string | null;
    createdAt: string;
  }[];
  ruleConsents: {
    id: string;
    status: "PENDING" | "INQUIRED";
    passName: string;
    trainerName: string;
    requestedAt: string;
    rules: { title: string; text: string }[];
  }[];
}

function ConsentItem({
  c,
  reload,
}: {
  c: Inbox["ruleConsents"][number];
  reload: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function respond(action: "AGREE" | "INQUIRE") {
    const r = await api(`/api/s/rule-consents/${c.id}`, {
      body: { action, inquiryText: text },
    });
    if (r.ok) reload();
    else setError(r.message);
  }
  return (
    <Card title={`수강 규칙 동의 · ${c.passName}`}>
      <p className="text-sm text-zinc-500">
        {c.trainerName} 트레이너가 수강 규칙 동의를 요청했습니다.
      </p>
      <RulesLines lines={c.rules} />
      {c.status === "INQUIRED" && (
        <Notice>문의를 보냈습니다. 트레이너 답변 후 동의해 주세요.</Notice>
      )}
      {asking && (
        <TextField
          label="문의 내용"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => respond("AGREE")}>
          동의
        </Button>
        {asking ? (
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => respond("INQUIRE")}
          >
            문의 보내기
          </Button>
        ) : (
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setAsking(true)}
          >
            문의하기
          </Button>
        )}
      </div>
    </Card>
  );
}

/** 요청함 (트레이너·수강생 공통): 연결 요청, (수강생) 규칙 동의 */
export function RequestsInbox() {
  const [data, setData] = useState<Inbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<Inbox>("/api/requests");
    if (r.ok) setData(r.data);
    else setError(r.message);
  }, []);
  useEffect(() => {
    // 처음 열 때 요청함을 불러온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function respondLink(id: string, accept: boolean) {
    const r = await api(`/api/requests/link/${id}`, { body: { accept } });
    if (r.ok) void load();
    else setError(r.message);
  }

  if (!data)
    return error ? (
      <Notice tone="error">{error}</Notice>
    ) : (
      <p className="text-sm text-zinc-500">불러오는 중…</p>
    );
  const empty =
    data.linkRequests.length === 0 && data.ruleConsents.length === 0;
  return (
    <div className="flex flex-col gap-3">
      {error && <Notice tone="error">{error}</Notice>}
      {empty && (
        <p className="text-sm text-zinc-500">처리할 요청이 없습니다.</p>
      )}
      {data.linkRequests.map((l) => (
        <Card key={l.id} title="연결 요청">
          <p className="text-sm">
            {l.fromRole === "TRAINER"
              ? `${l.fromName} 트레이너`
              : `${l.fromName} 수강생`}
            {l.workplace && (
              <span className="text-zinc-500"> · {l.workplace}</span>
            )}
            <span className="block text-xs text-zinc-500">
              {l.fromPhoneMasked}
            </span>
          </p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => respondLink(l.id, true)}>
              수락
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => respondLink(l.id, false)}
            >
              거절
            </Button>
          </div>
        </Card>
      ))}
      {data.ruleConsents.map((c) => (
        <ConsentItem key={c.id} c={c} reload={load} />
      ))}
    </div>
  );
}
