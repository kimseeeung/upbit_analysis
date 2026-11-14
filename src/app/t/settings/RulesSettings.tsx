"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { RulesEditor } from "@/components/RulesEditor";
import { Button, Card, Notice } from "@/components/ui";
import type { RuleValues } from "@/lib/rules/rule-set";

export function RulesSettings() {
  const [rules, setRules] = useState<RuleValues | null>(null);
  const [version, setVersion] = useState(0);
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    api<{ version: number; rules: RuleValues }>("/api/t/rules").then((r) => {
      if (r.ok) {
        setRules(r.data.rules);
        setVersion(r.data.version);
      }
    });
  }, []);

  async function save() {
    if (!rules) return;
    const r = await api<{ version: number }>("/api/t/rules", {
      method: "PUT",
      body: rules,
    });
    if (r.ok) {
      setVersion(r.data.version);
      setMsg({
        tone: "success",
        text: "저장했습니다. 새로 등록하는 이용권부터 적용됩니다",
      });
    } else setMsg({ tone: "error", text: r.message });
  }

  return (
    <Card title={`수강 규칙 (기본) · v${version}`}>
      <p className="text-muted text-xs">
        이용권을 등록할 때 이 규칙을 불러오고, 수강생별로 고칠 수 있습니다.
        수강생이 동의해야 노쇼·당일 취소를 차감합니다.
      </p>
      {rules && <RulesEditor value={rules} onChange={setRules} />}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button onClick={save} disabled={!rules}>
        저장
      </Button>
    </Card>
  );
}
