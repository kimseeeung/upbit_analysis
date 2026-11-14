"use client";

import { useEffect } from "react";
import {
  DEFAULT_DURATION,
  DURATION_OPTIONS,
  daysInMonth,
  formatDate,
  formatTime,
  minuteOptions,
  parseDate,
  parseTime,
} from "@/lib/input/datetime";
import { SELECT } from "./ui";

const WD = ["일", "월", "화", "수", "목", "금", "토"];

function weekday(y: number, m: number, d: number) {
  return WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** 오늘 (한국 날짜) */
function kstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

function Group({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <legend className="mb-1.5 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </fieldset>
  );
}

/**
 * 날짜 선택: 년 / 월 / 일 드롭다운 (한국 날짜 "YYYY-MM-DD").
 * 브라우저 달력 대신 드롭다운으로 고른다.
 */
export function DateSelect({
  label,
  value,
  onChange,
  fromYear,
  toYear,
  allowEmpty = false,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  fromYear?: number;
  toYear?: number;
  /** 비워 둘 수 있는 날짜(생년월일 등) */
  allowEmpty?: boolean;
  hint?: React.ReactNode;
  className?: string;
}) {
  const today = parseDate(kstToday())!;
  const cur = parseDate(value);
  // 비워 둘 수 없는 칸은 화면에 보이는 날짜(오늘)를 값으로 맞춘다
  useEffect(() => {
    if (!cur && !allowEmpty) onChange(formatDate(today));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, allowEmpty]);
  const p = cur ?? today;
  const y0 = fromYear ?? today.y - 1;
  const y1 = toYear ?? today.y + 3;
  const years: number[] = [];
  for (let y = Math.min(y0, p.y); y <= Math.max(y1, p.y); y++) years.push(y);
  const set = (next: Partial<typeof p>) =>
    onChange(formatDate({ ...p, ...next }));
  return (
    <Group label={label} className={className}>
      {allowEmpty && !cur ? (
        <button
          type="button"
          className={`${SELECT} text-muted`}
          onClick={() => onChange(formatDate(p))}
        >
          날짜 고르기
        </button>
      ) : (
        <>
          <select
            aria-label={`${label} 년`}
            className={SELECT}
            value={p.y}
            onChange={(e) => set({ y: Number(e.target.value) })}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <select
            aria-label={`${label} 월`}
            className={SELECT}
            value={p.m}
            onChange={(e) => set({ m: Number(e.target.value) })}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
          <select
            aria-label={`${label} 일`}
            className={SELECT}
            value={Math.min(p.d, daysInMonth(p.y, p.m))}
            onChange={(e) => set({ d: Number(e.target.value) })}
          >
            {Array.from({ length: daysInMonth(p.y, p.m) }, (_, i) => i + 1).map(
              (d) => (
                <option key={d} value={d}>
                  {d}일 ({weekday(p.y, p.m, d)})
                </option>
              ),
            )}
          </select>
          {allowEmpty && (
            <button
              type="button"
              className="text-muted text-xs underline"
              onClick={() => onChange("")}
            >
              지우기
            </button>
          )}
        </>
      )}
      {hint && <p className="text-muted w-full text-xs">{hint}</p>}
    </Group>
  );
}

/** 시각 선택: 오전/오후 · 시 · 분 드롭다운 ("HH:MM" 24시간) */
export function TimeSelect({
  label,
  value,
  onChange,
  minuteStep = 10,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  minuteStep?: number;
  className?: string;
}) {
  return (
    <Group label={label} className={className}>
      <TimeSelects
        label={label}
        value={value}
        onChange={onChange}
        minuteStep={minuteStep}
      />
    </Group>
  );
}

function TimeSelects({
  label,
  value,
  onChange,
  minuteStep,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  minuteStep: number;
}) {
  const t = parseTime(value) ?? { pm: false, h12: 9, minute: 0 };
  // 값이 비어 있으면 화면에 보이는 시각(오전 9시)을 값으로 맞춘다
  useEffect(() => {
    if (!parseTime(value)) onChange(formatTime(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const set = (next: Partial<typeof t>) =>
    onChange(formatTime({ ...t, ...next }));
  return (
    <>
      <select
        aria-label={`${label} 오전/오후`}
        className={SELECT}
        value={t.pm ? "PM" : "AM"}
        onChange={(e) => set({ pm: e.target.value === "PM" })}
      >
        <option value="AM">오전</option>
        <option value="PM">오후</option>
      </select>
      <select
        aria-label={`${label} 시`}
        className={SELECT}
        value={t.h12}
        onChange={(e) => set({ h12: Number(e.target.value) })}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={h}>
            {h}시
          </option>
        ))}
      </select>
      <select
        aria-label={`${label} 분`}
        className={SELECT}
        value={t.minute}
        onChange={(e) => set({ minute: Number(e.target.value) })}
      >
        {minuteOptions(minuteStep, t.minute).map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, "0")}분
          </option>
        ))}
      </select>
    </>
  );
}

/**
 * 날짜·시각 선택: 년 / 월 / 일 / 오전·오후 / 시 / 분 ("YYYY-MM-DDTHH:MM", 한국 시간)
 */
export function DateTimeSelect({
  label,
  value,
  onChange,
  minuteStep = 10,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  minuteStep?: number;
  className?: string;
}) {
  const [date, time] = value.includes("T") ? value.split("T") : [value, ""];
  const d = date || kstToday();
  const t = time || "09:00";
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <DateSelect
        label={label}
        value={d}
        onChange={(v) => onChange(`${v}T${t}`)}
        toYear={new Date().getFullYear() + 2}
      />
      <fieldset className="flex flex-wrap items-center gap-1.5">
        <legend className="sr-only">{label} 시각</legend>
        <TimeSelects
          label={label}
          value={t}
          onChange={(v) => onChange(`${d}T${v}`)}
          minuteStep={minuteStep}
        />
      </fieldset>
    </div>
  );
}

/** 수업 시간: 10분 단위 10~120분, 기본 50분 */
export function DurationSelect({
  value,
  onChange,
  label = "수업 시간",
}: {
  value: number;
  onChange: (v: number) => void;
  label?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      <select
        aria-label={label}
        className={SELECT}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {DURATION_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {m}분{m === DEFAULT_DURATION ? " (기본)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
