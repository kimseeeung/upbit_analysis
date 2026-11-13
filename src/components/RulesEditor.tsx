"use client";

import {
  LATE_CANCEL_HOURS_OPTIONS,
  NO_SHOW_MINUTES_OPTIONS,
  describeRules,
  type RuleValues,
} from "@/lib/rules/rule-set";
import { TextField } from "./ui";

function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
  format,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  format: (v: T) => string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
        value={String(value)}
        onChange={(e) => {
          const found = options.find((o) => String(o) === e.target.value);
          if (found !== undefined) onChange(found);
        }}
      >
        {options.map((o) => (
          <option key={String(o)} value={String(o)}>
            {format(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

const DEDUCT = ["true", "false"] as const;

/** 수강 규칙 편집 (3.5). 트레이너 기본 규칙과 이용권별 규칙에 같이 쓴다 */
export function RulesEditor({
  value,
  onChange,
}: {
  value: RuleValues;
  onChange: (v: RuleValues) => void;
}) {
  const set = <K extends keyof RuleValues>(k: K, v: RuleValues[K]) =>
    onChange({ ...value, [k]: v });
  const int = (s: string) => (s.trim() === "" ? NaN : Number(s));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="당일 취소 기준"
          value={value.lateCancelHours}
          options={LATE_CANCEL_HOURS_OPTIONS}
          onChange={(v) => set("lateCancelHours", v)}
          format={(v) => `${v}시간 전`}
        />
        <Select
          label="당일 취소 시"
          value={String(value.lateCancelDeduct) as "true" | "false"}
          options={DEDUCT}
          onChange={(v) => set("lateCancelDeduct", v === "true")}
          format={(v) => (v === "true" ? "1회 차감" : "차감 안 함")}
        />
        <Select
          label="노쇼 판정"
          value={value.noShowMinutes}
          options={NO_SHOW_MINUTES_OPTIONS}
          onChange={(v) => set("noShowMinutes", v)}
          format={(v) => `시작 후 ${v}분`}
        />
        <Select
          label="노쇼 시"
          value={String(value.noShowDeduct) as "true" | "false"}
          options={DEDUCT}
          onChange={(v) => set("noShowDeduct", v === "true")}
          format={(v) => (v === "true" ? "1회 차감" : "차감 안 함")}
        />
        <TextField
          label="미승인 자동 완료 (일)"
          type="number"
          min={1}
          max={30}
          value={
            Number.isNaN(value.unapprovedAutoCompleteDays)
              ? ""
              : value.unapprovedAutoCompleteDays
          }
          onChange={(e) =>
            set("unapprovedAutoCompleteDays", int(e.target.value))
          }
        />
        <TextField
          label="예약 변경 기한 (수업 n시간 전)"
          type="number"
          min={0}
          max={168}
          value={
            Number.isNaN(value.changeDeadlineHours)
              ? ""
              : value.changeDeadlineHours
          }
          onChange={(e) => set("changeDeadlineHours", int(e.target.value))}
        />
        <TextField
          label="일시정지 1회 최대 (일)"
          type="number"
          min={1}
          max={365}
          value={Number.isNaN(value.pauseMaxDays) ? "" : value.pauseMaxDays}
          onChange={(e) => set("pauseMaxDays", int(e.target.value))}
        />
        <TextField
          label="일시정지 횟수 (이용권당)"
          type="number"
          min={0}
          max={10}
          value={Number.isNaN(value.pauseMaxCount) ? "" : value.pauseMaxCount}
          onChange={(e) => set("pauseMaxCount", int(e.target.value))}
        />
      </div>
      <RulesText rules={value} />
    </div>
  );
}

export function RulesText({ rules }: { rules: RuleValues }) {
  return <RulesLines lines={describeRules(rules)} />;
}

export function RulesLines({
  lines,
}: {
  lines: { title: string; text: string }[];
}) {
  return (
    <dl className="grid grid-cols-[5rem_1fr] gap-x-2 gap-y-1 rounded-lg bg-zinc-100 p-3 text-xs dark:bg-zinc-800">
      {lines.map((l) => (
        <div key={l.title} className="contents">
          <dt className="font-medium">{l.title}</dt>
          <dd>{l.text}</dd>
        </div>
      ))}
    </dl>
  );
}
