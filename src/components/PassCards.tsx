"use client";

import { CalendarClock, CalendarRange, ScrollText, Ticket } from "lucide-react";

import { RulesLines } from "./RulesEditor";
import { Card } from "./ui";
import { PASS_STATUS_LABEL } from "@/lib/rules/rule-set";

export interface PassView {
  id: string;
  name: string;
  count: number;
  bonusCount: number;
  startDate: string;
  endDate: string;
  sessionMinutes: number;
  price: number | null;
  paidAt: string | null;
  payMethod: string | null;
  memo: string | null;
  soldBy: string;
  status: keyof typeof PASS_STATUS_LABEL;
  total: number;
  used: number;
  remaining: number;
  scheduled: number;
  rules: import("@/lib/rules/rule-set").RuleValues;
  appliedRules: { title: string; text: string }[];
  ruleAgreed: boolean;
  ruleAgreedAt: string | null;
  rulePending: boolean;
  consent: {
    id: string;
    status: string;
    requestedAt: string;
    inquiryText: string | null;
  } | null;
  changeLogs: {
    field: string;
    before: string | null;
    after: string | null;
    changedAt: string;
  }[];
}

export function PassSummary({
  p,
  children,
}: {
  p: PassView;
  children?: React.ReactNode;
}) {
  return (
    <Card title={p.name}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
        <span className="inline-flex items-center gap-1">
          <Ticket className="text-brand-500 size-4" aria-hidden />
          잔여 <strong>{p.remaining}</strong> / {p.total}회
        </span>
        <span className="text-muted inline-flex items-center gap-1">
          <CalendarClock className="size-4" aria-hidden />
          예정 {p.scheduled}회
        </span>
        <span className="text-muted inline-flex items-center gap-1">
          <CalendarRange className="size-4" aria-hidden />
          {p.startDate} ~ {p.endDate}
        </span>
        <span className="bg-brand-50 dark:bg-brand-700/20 rounded px-1.5 text-xs">
          {PASS_STATUS_LABEL[p.status]}
        </span>
      </div>
      <p className="text-muted text-xs">
        등록 {p.count}회{p.bonusCount ? ` + 서비스 ${p.bonusCount}회` : ""} ·
        1회 {p.sessionMinutes}분 · 판매 {p.soldBy}
      </p>
      <div className="flex flex-col gap-1">
        <p className="inline-flex items-center gap-1 text-xs font-semibold">
          <ScrollText className="size-3.5" aria-hidden />
          {p.ruleAgreed
            ? "동의한 수강 규칙"
            : "수강 규칙 (미동의: 노쇼·당일 취소를 차감하지 않습니다)"}
          {p.ruleAgreed && p.rulePending && " · 바뀐 규칙 동의 대기 중"}
        </p>
        <RulesLines lines={p.appliedRules} />
      </div>
      {children}
    </Card>
  );
}
