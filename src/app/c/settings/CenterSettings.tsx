"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { fmtDateTime } from "@/components/fmt";
import { RulesEditor } from "@/components/RulesEditor";
import { Button, Card, Notice, TextField } from "@/components/ui";
import type { RuleValues } from "@/lib/rules/rule-set";

/** 센터 설정 (9.3~9.5): 기본 수강 규칙, 관리자 추가, 센터 해산 */
export function CenterSettings() {
  const [rules, setRules] = useState<RuleValues | null>(null);
  const [adminCode, setAdminCode] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{
    tone: "success" | "error" | "warning";
    text: string;
  } | null>(null);
  useEffect(() => {
    api<{ rules: RuleValues }>("/api/c/rules").then(
      (r) => r.ok && setRules(r.data.rules),
    );
  }, []);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">센터 설정</h1>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Card title="센터 기본 수강 규칙">
        <p className="text-xs text-zinc-500">
          소속 트레이너가 처음 규칙을 정할 때 초기값으로 씁니다.
        </p>
        {rules && <RulesEditor value={rules} onChange={setRules} />}
        <Button
          onClick={async () => {
            const r = await api("/api/c/rules", { method: "PUT", body: rules });
            setMsg(
              r.ok
                ? { tone: "success", text: "저장했습니다" }
                : { tone: "error", text: r.message },
            );
          }}
        >
          저장
        </Button>
      </Card>
      <Card title="관리자 추가">
        <Button
          variant="secondary"
          onClick={async () => {
            const r = await api<{ code: string; expiresAt: string }>(
              "/api/c/invites",
              { body: { kind: "ADMIN" } },
            );
            if (r.ok) setAdminCode(r.data);
            else setMsg({ tone: "error", text: r.message });
          }}
        >
          관리자 초대 코드 만들기
        </Button>
        {adminCode && (
          <p className="text-sm">
            관리자 초대 코드: <strong>{adminCode.code}</strong> (
            {fmtDateTime(adminCode.expiresAt)}까지). 초대받은 사람이 내 정보에서
            입력합니다.
          </p>
        )}
      </Card>
      <Card title="센터 해산">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          소속 트레이너 전원에게 알리고 7일 뒤 개인 트레이너로 바뀝니다.
          수강생·이용권·기록은 그대로이고, 센터의 결제 합계·통계 화면은
          없어집니다.
        </p>
        <TextField
          label="확인을 위해 '해산'을 입력해 주세요"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button
          variant="danger"
          disabled={confirm !== "해산"}
          onClick={async () => {
            const r = await api<{ dissolveAt: string }>("/api/c/dissolve", {
              body: { confirm },
            });
            setMsg(
              r.ok
                ? {
                    tone: "warning",
                    text: `${fmtDateTime(r.data.dissolveAt)}에 해산됩니다`,
                  }
                : { tone: "error", text: r.message },
            );
          }}
        >
          센터 해산
        </Button>
      </Card>
    </div>
  );
}
