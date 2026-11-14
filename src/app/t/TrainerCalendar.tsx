"use client";

import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import koLocale from "@fullcalendar/core/locales/ko";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import { useDisplayMode } from "@/lib/display";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/components/api";
import { readSnapshot } from "@/lib/offline/client";
import { listQueue, type QueueRow } from "@/lib/offline/store";
import { STATUS_STYLE, fmtRange, kstDateKey } from "@/components/fmt";
import { CalendarPlus } from "lucide-react";
import { Notice, SELECT } from "@/components/ui";
import { NOTICE_ICON } from "./BookingNoticeControls";
import { CreateBookingSheet } from "./CreateBookingSheet";
import {
  TrainerBookingSheet,
  type TrainerBooking,
} from "./TrainerBookingSheet";

interface CalendarData {
  pauses?: {
    studentId: string;
    studentName: string;
    startDate: string;
    endDate: string;
  }[];
  hasAvailability: boolean;
  working: { start: string; end: string }[];
  pendingRequests: number;
  bookings: TrainerBooking[];
}

const HIDDEN_BY_DEFAULT = ["REJECTED", "EXPIRED"];

export function TrainerCalendar() {
  const displayMode = useDisplayMode();
  const initialDate = useSearchParams().get("date") ?? undefined;
  const [data, setData] = useState<CalendarData | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [studentNames, setStudentNames] = useState<string[]>([]);
  useEffect(() => {
    // 수강생별 보기 목록 (오프라인이면 휴대폰 백업)
    void api<{ students: { name: string }[] }>(
      "/api/t/students?filter=ALL",
    ).then(async (r) => {
      const list = r.ok
        ? r.data.students
        : ((await readSnapshot<{ students: { name: string }[] }>())?.students ??
          []);
      setStudentNames([...new Set(list.map((x) => x.name))].sort());
    });
  }, []);
  const [creating, setCreating] = useState<{ start: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const calRef = useRef<FullCalendar>(null);
  const [queued, setQueued] = useState<QueueRow[]>([]);
  useEffect(() => {
    const on = () => void listQueue().then(setQueued);
    on();
    window.addEventListener("pt:queue", on);
    return () => window.removeEventListener("pt:queue", on);
  }, []);

  const load = useCallback(async (r: { from: string; to: string }) => {
    const res = await api<CalendarData>(
      `/api/t/calendar?from=${r.from}&to=${r.to}`,
    );
    if (res.ok) {
      setData(res.data);
      return;
    }
    if (res.code === "NETWORK") {
      // 오프라인: 휴대폰 백업으로 표시 (11.2)
      const snap = await readSnapshot<{ calendar: CalendarData }>();
      if (snap) {
        const start = new Date(`${r.from}T00:00:00+09:00`).getTime();
        const end = new Date(`${r.to}T00:00:00+09:00`).getTime() + 86400_000;
        setData({
          ...snap.calendar,
          bookings: snap.calendar.bookings.filter(
            (b) =>
              new Date(b.startAt).getTime() < end &&
              new Date(b.endAt).getTime() > start,
          ),
          working: snap.calendar.working.filter(
            (w) =>
              new Date(w.start).getTime() < end &&
              new Date(w.end).getTime() > start,
          ),
        });
        return;
      }
    }
    setMsg({ tone: "error", text: res.message });
  }, []);
  const reload = useCallback(() => range && load(range), [range, load]);
  useEffect(() => {
    const on = () => void reload();
    window.addEventListener("pt:backup", on);
    return () => window.removeEventListener("pt:backup", on);
  }, [reload]);

  const onDatesSet = useCallback(
    (arg: DatesSetArg) => {
      const r = {
        from: kstDateKey(arg.start),
        to: kstDateKey(new Date(arg.end.getTime() - 1)),
      };
      setRange(r);
      void load(r);
    },
    [load],
  );

  const events: EventInput[] = useMemo(() => {
    if (!data) return [];
    const list: EventInput[] = data.working.map((w, i) => ({
      id: `work-${i}`,
      start: w.start,
      end: w.end,
      groupId: "working",
      display: "inverse-background",
      color: "#e4e4e7",
    }));
    for (const b of data.bookings) {
      if (HIDDEN_BY_DEFAULT.includes(b.status)) continue;
      if (nameFilter && b.studentName !== nameFilter) continue;
      const st = STATUS_STYLE[b.status];
      const flags = [
        b.notice?.manualShare ? "📨" : "",
        b.ruleUnagreed ? "⚠" : "",
        b.cancelRequestedAt ? "취소요청" : "",
        b.changeRequest?.kind === "CHANGE" ? "변경요청" : "",
        b.changeRequest?.kind === "PROPOSAL" ? "제안" : "",
        b.autoConfirmed ? "자동확정" : "",
      ].filter(Boolean);
      list.push({
        id: b.id,
        title: `${b.studentName} · ${st.label}${flags.length ? ` · ${flags.join(" ")}` : ""}`,
        start: b.startAt,
        end: b.endAt,
        backgroundColor: st.color,
        borderColor: st.color,
        startEditable:
          b.status === "PENDING_CONFIRM" || b.status === "CONFIRMED",
        durationEditable: false,
        classNames: [
          `booking-${b.id}`,
          ...(b.status === "INSUFFICIENT" ? ["opacity-60"] : []),
        ],
        extendedProps: {
          kind: "booking",
          noticeIcon: b.notice?.dayBefore ?? null,
        },
      });
      // 변경 요청 중인 새 시간은 점선
      if (b.changeRequest?.kind === "CHANGE") {
        for (const s of b.changeRequest.slots) {
          list.push({
            id: `ghost-${b.id}-${s.startAt}`,
            title: `${b.studentName} · 변경 요청 시간`,
            start: s.startAt,
            end: s.endAt,
            backgroundColor: "transparent",
            borderColor: st.color,
            textColor: st.color,
            editable: false,
            classNames: ["border-dashed", "border-2"],
            extendedProps: { kind: "ghost", bookingId: b.id },
          });
        }
      }
    }
    // 휴대폰에 임시 저장한 예약 (동기화 대기)
    for (const q of queued) {
      if (q.op.kind !== "CREATE_BOOKING") continue;
      const p = q.op.payload as {
        startAt: string;
        durationMinutes?: number;
        studentName?: string;
      };
      list.push({
        id: `queued-${q.id}`,
        title: `${p.studentName ?? ""} · 동기화 대기`,
        start: p.startAt,
        end: new Date(
          new Date(p.startAt).getTime() + (p.durationMinutes ?? 50) * 60_000,
        ).toISOString(),
        backgroundColor: "#a1a1aa",
        borderColor: "#71717a",
        editable: false,
        classNames: ["border-dashed"],
      });
    }
    const queuedIds = new Set(
      queued
        .map((q) => (q.op.payload as { bookingId?: string }).bookingId)
        .filter(Boolean),
    );
    for (const e of list)
      if (typeof e.id === "string" && queuedIds.has(e.id))
        e.title = `${e.title} · 동기화 대기`;
    // 일시정지 기간은 빗금 (4.2)
    for (const pz of data.pauses ?? []) {
      const end = new Date(`${pz.endDate}T00:00:00+09:00`);
      end.setUTCDate(end.getUTCDate() + 1);
      list.push({
        id: `pause-${pz.studentId}-${pz.startDate}`,
        title: `${pz.studentName} 일시정지`,
        start: `${pz.startDate}T00:00:00+09:00`,
        end: end.toISOString(),
        display: "background",
        classNames: ["pt-paused"],
      });
    }
    return list;
  }, [data, nameFilter, queued]);

  async function onDrop(arg: EventDropArg) {
    const b = data?.bookings.find((x) => x.id === arg.event.id);
    if (!b || !arg.event.start || !arg.event.end) return arg.revert();
    const r = await api<{ mode: "MODIFIED" | "CHANGE_REQUESTED" }>(
      `/api/t/bookings/${b.id}/reschedule`,
      {
        body: {
          startAt: arg.event.start.toISOString(),
          endAt: arg.event.end.toISOString(),
        },
      },
    );
    // 확정된 예약은 수락 전까지 원래 시간 유지
    arg.revert();
    if (r.ok) {
      setMsg({
        tone: "success",
        text:
          r.data.mode === "MODIFIED"
            ? "시간을 바꾸고 확정 요청을 다시 보냈습니다"
            : "변경 요청을 보냈습니다. 수강생이 수락할 때까지 원래 시간이 유지됩니다",
      });
    } else setMsg({ tone: "error", text: r.message });
    void reload();
  }

  function onClick(arg: EventClickArg) {
    const kind = arg.event.extendedProps.kind;
    if (kind === "booking") setSelected(arg.event.id);
    if (kind === "ghost")
      setSelected(arg.event.extendedProps.bookingId as string);
  }

  function onSelect(arg: DateSelectArg) {
    setCreating({ start: arg.start.toISOString() });
    calRef.current?.getApi().unselect();
  }

  const selectedBooking = data?.bookings.find((b) => b.id === selected) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">캘린더</h1>
        <div className="flex items-center gap-2">
          {data && data.pendingRequests > 0 && (
            <Link
              href="/t/requests"
              className="rounded-full bg-rose-500 px-2.5 py-1 text-xs font-semibold text-white"
            >
              대기 요청 {data.pendingRequests}
            </Link>
          )}
          <button
            type="button"
            onClick={() =>
              setCreating({
                start: new Date(
                  Math.ceil(Date.now() / 3600_000) * 3600_000,
                ).toISOString(),
              })
            }
            className="bg-brand-500 shadow-brand-500/30 hover:bg-brand-600 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold text-white shadow-sm"
          >
            <CalendarPlus className="size-4" aria-hidden />
            예약 등록
          </button>
        </div>
      </div>
      {data && !data.hasAvailability && (
        <Notice tone="warning">
          근무 가능 시간을 설정하지 않아 수강생이 예약을 신청할 수 없습니다.{" "}
          <Link href="/t/settings" className="underline">
            설정하기
          </Link>
        </Notice>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">수강생별 보기</span>
        <select
          aria-label="수강생별 보기"
          className={SELECT}
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        >
          <option value="">전체 수강생</option>
          {studentNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="text-sm [&_.fc-button]:whitespace-nowrap [&_.fc-toolbar]:flex-wrap [&_.fc-toolbar]:gap-2 [&_.fc-toolbar-title]:text-base max-sm:[&_.fc-toolbar-title]:text-sm">
        <FullCalendar
          key={displayMode}
          ref={calRef}
          plugins={[
            dayGridPlugin,
            timeGridPlugin,
            interactionPlugin,
            luxonPlugin,
            listPlugin,
          ]}
          timeZone="Asia/Seoul"
          locale={koLocale}
          initialView={
            displayMode === "MOBILE" ? "timeGridDay" : "timeGridWeek"
          }
          initialDate={initialDate}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridDay,timeGridWeek,dayGridMonth,listWeek",
          }}
          buttonText={{
            today: "오늘",
            month: "월",
            week: "주",
            day: "일",
            list: "목록",
          }}
          height={displayMode === "MOBILE" ? "72vh" : "78vh"}
          slotMinTime="00:00:00"
          scrollTime="07:00:00"
          slotMaxTime="24:00:00"
          slotDuration="00:30:00"
          allDaySlot={false}
          nowIndicator
          navLinks
          selectable
          selectMirror
          editable
          eventDurationEditable={false}
          events={events}
          datesSet={onDatesSet}
          eventDrop={onDrop}
          eventClick={onClick}
          eventContent={(arg) => {
            const key = arg.event.extendedProps.noticeIcon as
              keyof typeof NOTICE_ICON | null;
            const icon = key ? NOTICE_ICON[key] : null;
            return (
              <div className="flex items-start gap-1 overflow-hidden px-0.5 text-xs leading-tight">
                {icon && (
                  <span
                    title={icon.label}
                    aria-label={icon.label}
                    className={`shrink-0 rounded px-0.5 ${icon.cls}`}
                  >
                    {icon.icon}
                  </span>
                )}
                <span className="truncate">
                  {arg.timeText && <b className="mr-1">{arg.timeText}</b>}
                  {arg.event.title}
                </span>
              </div>
            );
          }}
          select={onSelect}
        />
      </div>
      <ul className="flex flex-wrap gap-2 text-xs">
        {Object.entries(STATUS_STYLE)
          .filter(([k]) => !HIDDEN_BY_DEFAULT.includes(k))
          .map(([k, v]) => (
            <li key={k} className="flex items-center gap-1">
              <span
                className="inline-block size-3 rounded"
                style={{ background: v.color }}
              />
              {v.label}
            </li>
          ))}
        <li>⚠ 규칙 미동의</li>
        <li>🔔 전일 알림(예정·미확인)</li>
        <li>✓ 확인</li>
        <li>! 못 보냄</li>
        <li>🔕 꺼짐</li>
        <li>📨 직접 보내야 함</li>
      </ul>

      {data && (
        <div className="sr-only" aria-live="polite">
          {data.bookings
            .map(
              (b) =>
                `${b.studentName} ${STATUS_STYLE[b.status].label} ${fmtRange(b.startAt, b.endAt)}`,
            )
            .join(", ")}
        </div>
      )}

      {creating && (
        <CreateBookingSheet
          initialStart={creating.start}
          onClose={() => setCreating(null)}
          onCreated={(text) => {
            setCreating(null);
            setMsg({ tone: "success", text });
            void reload();
          }}
        />
      )}
      {selectedBooking && (
        <TrainerBookingSheet
          booking={selectedBooking}
          onClose={() => setSelected(null)}
          onChanged={(text) => {
            setSelected(null);
            if (text) setMsg({ tone: "success", text });
            void reload();
          }}
        />
      )}
    </div>
  );
}
