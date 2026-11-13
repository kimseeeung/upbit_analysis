"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { PassSummary, type PassView } from "@/components/PassCards";
import { PausePanel } from "@/components/PausePanel";
import { RulesEditor } from "@/components/RulesEditor";
import { Button, Card, Checkbox, Notice, TextField } from "@/components/ui";
import { suggestEndDate, type RuleValues } from "@/lib/rules/rule-set";

interface Detail {
  name: string;
  passes: PassView[];
}

function todayKst() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

const FIELD_LABEL: Record<string, string> = {
  name: "이용권명",
  count: "등록 횟수",
  bonusCount: "서비스 횟수",
  startDate: "시작일",
  endDate: "만료일",
  sessionMinutes: "1회 수업 시간",
  price: "결제 금액",
  paidAt: "결제일",
  payMethod: "결제 수단",
  memo: "메모",
  rules: "수강 규칙",
  status: "상태",
};

interface FormState {
  name: string;
  count: string;
  bonusCount: string;
  startDate: string;
  endDate: string;
  endTouched: boolean;
  sessionMinutes: string;
  price: string;
  paidAt: string;
  payMethod: string;
  memo: string;
  customRules: boolean;
  rules: RuleValues | null;
}

function emptyForm(): FormState {
  const start = todayKst();
  return {
    name: "",
    count: "20",
    bonusCount: "0",
    startDate: start,
    endDate: suggestEndDate(start, 20),
    endTouched: false,
    sessionMinutes: "50",
    price: "",
    paidAt: "",
    payMethod: "",
    memo: "",
    customRules: false,
    rules: null,
  };
}

function fromPass(p: PassView): FormState {
  return {
    name: p.name,
    count: String(p.count),
    bonusCount: String(p.bonusCount),
    startDate: p.startDate,
    endDate: p.endDate,
    endTouched: true,
    sessionMinutes: String(p.sessionMinutes),
    price: p.price === null ? "" : String(p.price),
    paidAt: p.paidAt ?? "",
    payMethod: p.payMethod ?? "",
    memo: p.memo ?? "",
    customRules: true,
    rules: p.rules,
  };
}

function PassForm({
  initial,
  defaultRules,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FormState;
  defaultRules: RuleValues | null;
  submitLabel: string;
  onSubmit: (body: Record<string, unknown>) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((prev) => {
      const next = { ...prev, [k]: v };
      // 만료일을 직접 고치기 전까지는 횟수·시작일에 맞춰 제안
      if (
        !next.endTouched &&
        (k === "count" || k === "bonusCount" || k === "startDate") &&
        next.startDate
      ) {
        const total = Number(next.count || 0) + Number(next.bonusCount || 0);
        if (total > 0) next.endDate = suggestEndDate(next.startDate, total);
      }
      return next;
    });

  async function submit() {
    setError(null);
    const err = await onSubmit({
      name: f.name,
      count: Number(f.count),
      bonusCount: Number(f.bonusCount || 0),
      startDate: f.startDate,
      endDate: f.endDate,
      sessionMinutes: Number(f.sessionMinutes),
      price: f.price === "" ? null : Number(f.price),
      paidAt: f.paidAt || null,
      payMethod: f.payMethod || null,
      memo: f.memo || null,
      rules: f.customRules ? (f.rules ?? defaultRules) : null,
    });
    if (err) setError(err);
  }

  return (
    <Card title={submitLabel}>
      <TextField
        label="이용권명"
        placeholder="PT 20회 (2026 겨울)"
        value={f.name}
        onChange={(e) => set("name", e.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="등록 횟수"
          type="number"
          min={1}
          value={f.count}
          onChange={(e) => set("count", e.target.value)}
        />
        <TextField
          label="서비스 횟수"
          type="number"
          min={0}
          value={f.bonusCount}
          onChange={(e) => set("bonusCount", e.target.value)}
        />
        <TextField
          label="시작일"
          type="date"
          value={f.startDate}
          onChange={(e) => set("startDate", e.target.value)}
        />
        <TextField
          label="만료일"
          type="date"
          value={f.endDate}
          onChange={(e) =>
            setF((p) => ({ ...p, endDate: e.target.value, endTouched: true }))
          }
          hint={f.endTouched ? undefined : "횟수에 맞춰 제안한 날짜"}
        />
        <TextField
          label="1회 수업 시간 (분)"
          type="number"
          step={5}
          value={f.sessionMinutes}
          onChange={(e) => set("sessionMinutes", e.target.value)}
        />
        <TextField
          label="결제 금액 (원)"
          type="number"
          min={0}
          value={f.price}
          onChange={(e) => set("price", e.target.value)}
        />
        <TextField
          label="결제일"
          type="date"
          value={f.paidAt}
          onChange={(e) => set("paidAt", e.target.value)}
        />
        <TextField
          label="결제 수단"
          placeholder="카드, 계좌이체 등"
          value={f.payMethod}
          onChange={(e) => set("payMethod", e.target.value)}
        />
      </div>
      <p className="text-xs text-zinc-500">
        앱은 결제 기록만 남기고 실제 결제는 받지 않습니다.
      </p>
      <TextField
        label="메모"
        value={f.memo}
        onChange={(e) => set("memo", e.target.value)}
      />
      <Checkbox
        label="이 수강생만 수강 규칙을 다르게 정하기"
        checked={f.customRules}
        onChange={(v) =>
          setF((p) => ({
            ...p,
            customRules: v,
            rules: p.rules ?? defaultRules,
          }))
        }
      />
      {f.customRules && (f.rules ?? defaultRules) && (
        <RulesEditor
          value={(f.rules ?? defaultRules)!}
          onChange={(r) => setF((p) => ({ ...p, rules: r }))}
        />
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          취소
        </Button>
        <Button className="flex-1" onClick={submit}>
          저장
        </Button>
      </div>
    </Card>
  );
}

export function PassManager({ studentId }: { studentId: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [defaultRules, setDefaultRules] = useState<RuleValues | null>(null);
  const [mode, setMode] = useState<
    { kind: "none" } | { kind: "new" } | { kind: "edit"; pass: PassView }
  >({ kind: "none" });
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [extendTo, setExtendTo] = useState<Record<string, string>>({});
  const [bonus, setBonus] = useState<Record<string, string>>({});
  const [confirmRefund, setConfirmRefund] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api<Detail>(`/api/t/students/${studentId}`);
    if (r.ok) setD(r.data);
    else setMsg({ tone: "error", text: r.message });
  }, [studentId]);
  useEffect(() => {
    // 처음 열 때 이용권과 기본 규칙을 불러온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    void api<{ rules: RuleValues }>("/api/t/rules").then(
      (r) => r.ok && setDefaultRules(r.data.rules),
    );
  }, [load]);

  async function act(url: string, body: unknown, ok: string) {
    const r = await api(url, { body });
    setMsg(
      r.ok ? { tone: "success", text: ok } : { tone: "error", text: r.message },
    );
    if (r.ok) void load();
    return r.ok;
  }

  if (!d)
    return msg ? (
      <Notice tone={msg.tone}>{msg.text}</Notice>
    ) : (
      <p className="text-sm text-zinc-500">불러오는 중…</p>
    );
  return (
    <div className="flex flex-col gap-4">
      <Link href={`/t/students/${studentId}`} className="text-sm text-zinc-500">
        ← {d.name}
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">이용권 관리</h1>
        {mode.kind === "none" && (
          <Button onClick={() => setMode({ kind: "new" })}>이용권 추가</Button>
        )}
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {mode.kind === "new" && (
        <PassForm
          initial={emptyForm()}
          defaultRules={defaultRules}
          submitLabel="이용권 추가"
          onCancel={() => setMode({ kind: "none" })}
          onSubmit={async (body) => {
            const r = await api(`/api/t/students/${studentId}/passes`, {
              body,
            });
            if (!r.ok) return r.message;
            setMode({ kind: "none" });
            setMsg({
              tone: "success",
              text: "이용권을 등록했습니다. 수강생에게 규칙 동의를 요청했습니다",
            });
            void load();
            return null;
          }}
        />
      )}
      {mode.kind === "edit" && (
        <PassForm
          initial={fromPass(mode.pass)}
          defaultRules={defaultRules}
          submitLabel={`${mode.pass.name} 수정`}
          onCancel={() => setMode({ kind: "none" })}
          onSubmit={async (body) => {
            const r = await api(`/api/t/passes/${mode.pass.id}`, {
              method: "PATCH",
              body,
            });
            if (!r.ok) return r.message;
            setMode({ kind: "none" });
            setMsg({ tone: "success", text: "수정했습니다" });
            void load();
            return null;
          }}
        />
      )}

      {d.passes.length === 0 && mode.kind === "none" && (
        <p className="text-sm text-zinc-500">등록한 이용권이 없습니다.</p>
      )}
      {d.passes.map((p) => (
        <PassSummary key={p.id} p={p}>
          {p.status !== "REFUNDED" && (
            <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setMode({ kind: "edit", pass: p })}
                >
                  수정
                </Button>
                {(!p.ruleAgreed || p.rulePending) && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      act(
                        `/api/t/passes/${p.id}/consent-request`,
                        {},
                        "규칙 동의 요청을 보냈습니다",
                      )
                    }
                  >
                    규칙 동의 요청 보내기
                  </Button>
                )}
                {confirmRefund === p.id ? (
                  <Button
                    variant="danger"
                    onClick={async () => {
                      await act(
                        `/api/t/passes/${p.id}/refund`,
                        {},
                        "환불 처리했습니다",
                      );
                      setConfirmRefund(null);
                    }}
                  >
                    환불 처리 확인
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmRefund(p.id)}
                  >
                    환불 처리
                  </Button>
                )}
              </div>
              {p.consent?.status === "INQUIRED" && (
                <Notice tone="warning">
                  수강생 문의: {p.consent.inquiryText ?? "(내용 없음)"}
                </Notice>
              )}
              <div className="flex items-end gap-2">
                <TextField
                  className="flex-1"
                  label="만료일 연장"
                  type="date"
                  value={extendTo[p.id] ?? ""}
                  onChange={(e) =>
                    setExtendTo((x) => ({ ...x, [p.id]: e.target.value }))
                  }
                />
                <Button
                  variant="secondary"
                  disabled={!extendTo[p.id]}
                  onClick={() =>
                    act(
                      `/api/t/passes/${p.id}/extend`,
                      { endDate: extendTo[p.id] },
                      "만료일을 연장했습니다",
                    )
                  }
                >
                  연장
                </Button>
              </div>
              <div className="flex items-end gap-2">
                <TextField
                  className="flex-1"
                  label="서비스 횟수 추가"
                  type="number"
                  min={1}
                  value={bonus[p.id] ?? ""}
                  onChange={(e) =>
                    setBonus((x) => ({ ...x, [p.id]: e.target.value }))
                  }
                />
                <Button
                  variant="secondary"
                  disabled={!bonus[p.id]}
                  onClick={() =>
                    act(
                      `/api/t/passes/${p.id}/bonus`,
                      { add: Number(bonus[p.id]) },
                      "서비스 횟수를 추가했습니다",
                    )
                  }
                >
                  추가
                </Button>
              </div>
            </div>
          )}
          {(p.status === "ACTIVE" || p.status === "PAUSED") && (
            <PausePanel passId={p.id} role="TRAINER" onChanged={load} />
          )}
          {p.changeLogs.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-zinc-500">
                변경 이력
              </summary>
              <ul className="mt-1 flex flex-col gap-0.5">
                {p.changeLogs.map((c, i) => (
                  <li key={i}>
                    {new Date(c.changedAt).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}{" "}
                    · {FIELD_LABEL[c.field] ?? c.field}:{" "}
                    {c.field === "rules"
                      ? "바뀐 규칙"
                      : `${c.before ?? "-"} → ${c.after ?? "-"}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </PassSummary>
      ))}
    </div>
  );
}
