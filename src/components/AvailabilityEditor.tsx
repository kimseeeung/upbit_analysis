"use client";

import { DateSelect, TimeSelect } from "@/components/pickers";
import { useEffect, useState } from "react";
import { api } from "./api";
import { Button, Card, Loading, Notice } from "./ui";

interface Rule {
  weekday: number;
  startTime: string;
  endTime: string;
}
interface Exception {
  date: string;
  isOff: boolean;
  startTime?: string | null;
  endTime?: string | null;
}

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

/** 근무 가능 시간 (4.3): 요일별 시간대 + 휴무일·예외일 */
export function AvailabilityEditor({ onSaved }: { onSaved?: () => void }) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    api<{ rules: Rule[]; exceptions: Exception[] }>("/api/t/availability").then(
      (r) => {
        if (r.ok) {
          setRules(r.data.rules);
          setExceptions(r.data.exceptions);
        }
      },
    );
  }, []);

  async function save() {
    const r = await api("/api/t/availability", {
      method: "PUT",
      body: { rules, exceptions },
    });
    setMsg(
      r.ok
        ? { tone: "success", text: "근무 가능 시간을 저장했습니다" }
        : { tone: "error", text: r.message },
    );
    if (r.ok) onSaved?.();
  }

  if (!rules) return <Loading />;
  const update = (i: number, patch: Partial<Rule>) =>
    setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Card title="근무 가능 시간">
      <p className="text-muted text-xs">
        수강생은 이 시간 안에서만 예약을 신청할 수 있습니다. 설정하지 않으면
        수강생 화면에 예약 신청 버튼이 보이지 않습니다.
      </p>
      <ul className="flex flex-col gap-2">
        {ORDER.map((wd) => {
          const items = rules
            .map((r, i) => ({ r, i }))
            .filter((x) => x.r.weekday === wd);
          return (
            <li
              key={wd}
              className="border-line flex flex-col gap-1 border-b pb-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{DAYS[wd]}요일</span>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setRules([
                      ...rules,
                      { weekday: wd, startTime: "09:00", endTime: "18:00" },
                    ])
                  }
                >
                  + 시간대
                </Button>
              </div>
              {items.length === 0 && (
                <span className="text-muted text-xs">휴무</span>
              )}
              {items.map(({ r, i }) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <TimeSelect
                    label={`${DAYS[wd]}요일 시작`}
                    value={r.startTime}
                    onChange={(v) => update(i, { startTime: v })}
                  />
                  ~
                  <TimeSelect
                    label={`${DAYS[wd]}요일 끝`}
                    value={r.endTime}
                    onChange={(v) => update(i, { endTime: v })}
                  />
                  <Button
                    variant="ghost"
                    onClick={() => setRules(rules.filter((_, j) => j !== i))}
                  >
                    삭제
                  </Button>
                </div>
              ))}
            </li>
          );
        })}
      </ul>
      <h3 className="text-sm font-medium">휴무일·예외일</h3>
      {exceptions.map((e, i) => (
        <div
          key={i}
          className="border-line flex flex-wrap items-end gap-2 rounded-xl border p-3 text-sm"
        >
          <DateSelect
            label="예외일 날짜"
            value={e.date}
            onChange={(v) =>
              setExceptions(
                exceptions.map((x, j) => (j === i ? { ...x, date: v } : x)),
              )
            }
          />
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={e.isOff}
              onChange={(ev) =>
                setExceptions(
                  exceptions.map((x, j) =>
                    j === i ? { ...x, isOff: ev.target.checked } : x,
                  ),
                )
              }
            />
            휴무
          </label>
          {!e.isOff && (
            <>
              <TimeSelect
                label="예외일 시작"
                value={e.startTime ?? ""}
                onChange={(v) =>
                  setExceptions(
                    exceptions.map((x, j) =>
                      j === i ? { ...x, startTime: v } : x,
                    ),
                  )
                }
              />
              ~
              <TimeSelect
                label="예외일 끝"
                value={e.endTime ?? ""}
                onChange={(v) =>
                  setExceptions(
                    exceptions.map((x, j) =>
                      j === i ? { ...x, endTime: v } : x,
                    ),
                  )
                }
              />
            </>
          )}
          <Button
            variant="ghost"
            onClick={() => setExceptions(exceptions.filter((_, j) => j !== i))}
          >
            삭제
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        onClick={() =>
          setExceptions([
            ...exceptions,
            {
              date: new Date(Date.now() + 9 * 3600_000)
                .toISOString()
                .slice(0, 10),
              isOff: true,
            },
          ])
        }
      >
        + 휴무일·예외일
      </Button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button onClick={save}>근무 가능 시간 저장</Button>
    </Card>
  );
}
