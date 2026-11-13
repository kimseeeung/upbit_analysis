"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { KakaoShareButton } from "@/components/KakaoShareButton";
import { PassSummary, type PassView } from "@/components/PassCards";
import { StudentNotify } from "./StudentNotify";
import { Button, Card, Notice } from "@/components/ui";

interface Detail {
  studentId: string;
  name: string;
  phone: string;
  registered: boolean;
  birthDate: string | null;
  linkedSince: string;
  hidden: boolean;
  memo: string;
  notifyDayBefore: boolean;
  notify2h: boolean;
  availableToday: number;
  passes: PassView[];
}

export function StudentDetail({ id }: { id: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [memo, setMemo] = useState("");
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const load = useCallback(async () => {
    const r = await api<Detail>(`/api/t/students/${id}`);
    if (r.ok) {
      setD(r.data);
      setMemo(r.data.memo);
    } else setMsg({ tone: "error", text: r.message });
  }, [id]);
  useEffect(() => {
    // 처음 열 때 상세를 불러온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>, ok: string) {
    const r = await api(`/api/t/students/${id}`, { method: "PATCH", body });
    setMsg(
      r.ok ? { tone: "success", text: ok } : { tone: "error", text: r.message },
    );
    if (r.ok) void load();
  }

  if (!d)
    return msg ? (
      <Notice tone={msg.tone}>{msg.text}</Notice>
    ) : (
      <p className="text-sm text-zinc-500">불러오는 중…</p>
    );
  return (
    <div className="flex flex-col gap-4">
      <Link href="/t/students" className="text-sm text-zinc-500">
        ← 수강생 목록
      </Link>
      <h1 className="text-lg font-semibold">
        {d.name}{" "}
        {!d.registered && <span className="text-xs text-zinc-500">미가입</span>}
      </h1>
      <Card title="기본 정보">
        <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
          <dt className="text-zinc-500">전화번호</dt>
          <dd>{d.phone}</dd>
          {d.birthDate && (
            <>
              <dt className="text-zinc-500">생년월일</dt>
              <dd>{d.birthDate}</dd>
            </>
          )}
          <dt className="text-zinc-500">담당 시작</dt>
          <dd>{d.linkedSince}</dd>
          <dt className="text-zinc-500">예약 가능</dt>
          <dd>{d.availableToday}회 (오늘 기준)</dd>
        </dl>
      </Card>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">이용권</h2>
        <Link
          href={`/t/students/${id}/passes`}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          이용권 관리
        </Link>
      </div>
      {d.passes.length === 0 && (
        <p className="text-sm text-zinc-500">등록한 이용권이 없습니다.</p>
      )}
      {d.passes.map((p) => (
        <PassSummary key={p.id} p={p} />
      ))}
      <Card title="트레이너 메모">
        <textarea
          aria-label="트레이너 메모"
          className="min-h-24 rounded-lg border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
        <Button
          variant="secondary"
          onClick={() => patch({ memo }, "메모를 저장했습니다")}
        >
          메모 저장
        </Button>
      </Card>
      <StudentNotify
        studentId={id}
        notifyDayBefore={d.notifyDayBefore}
        notify2h={d.notify2h}
        onChanged={load}
      />
      {d.passes
        .filter(
          (p) =>
            p.consent &&
            p.consent.status !== "AGREED" &&
            p.consent.status !== "SUPERSEDED",
        )
        .map((p) => (
          <Card key={p.id} title={`규칙 동의 요청 · ${p.name}`}>
            <KakaoShareButton
              purpose="RULE_CONSENT"
              refId={p.consent!.id}
              label="카톡으로 규칙 동의 요청 보내기"
            />
          </Card>
        ))}
      <p className="text-sm text-zinc-500">
        수업 이력은 수강 현황에서 볼 수 있습니다.
      </p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button
        variant="ghost"
        onClick={() =>
          patch(
            { hidden: !d.hidden },
            d.hidden ? "수강 중으로 바꿨습니다" : "수강을 종료했습니다",
          )
        }
      >
        {d.hidden ? "수강 중으로 되돌리기" : "수강 종료 (목록에서 숨김)"}
      </Button>
    </div>
  );
}
