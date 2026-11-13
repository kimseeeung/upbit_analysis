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
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "@/components/api";
import { STATUS_STYLE, fmtRange, kstDateKey } from "@/components/fmt";
import { Notice, TextField } from "@/components/ui";
import { CreateBookingSheet } from "./CreateBookingSheet";
import {
  TrainerBookingSheet,
  type TrainerBooking,
} from "./TrainerBookingSheet";

interface CalendarData {
  hasAvailability: boolean;
  working: { start: string; end: string }[];
  pendingRequests: number;
  bookings: TrainerBooking[];
}

const HIDDEN_BY_DEFAULT = ["REJECTED", "EXPIRED"];

export function TrainerCalendar() {
  const initialDate = useSearchParams().get("date") ?? undefined;
  const [data, setData] = useState<CalendarData | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [creating, setCreating] = useState<{ start: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const calRef = useRef<FullCalendar>(null);

  const load = useCallback(async (r: { from: string; to: string }) => {
    const res = await api<CalendarData>(
      `/api/t/calendar?from=${r.from}&to=${r.to}`,
    );
    if (res.ok) setData(res.data);
    else setMsg({ tone: "error", text: res.message });
  }, []);
  const reload = useCallback(() => range && load(range), [range, load]);

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
      if (nameFilter && !b.studentName.includes(nameFilter)) continue;
      const st = STATUS_STYLE[b.status];
      const flags = [
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
        classNames: b.status === "INSUFFICIENT" ? ["opacity-60"] : [],
        extendedProps: { kind: "booking" },
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
    return list;
  }, [data, nameFilter]);

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
              className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs text-white"
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
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
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
      <TextField
        label="수강생 이름 필터"
        value={nameFilter}
        onChange={(e) => setNameFilter(e.target.value)}
      />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="text-sm [&_.fc-toolbar-title]:text-base">
        <FullCalendar
          ref={calRef}
          plugins={[
            dayGridPlugin,
            timeGridPlugin,
            interactionPlugin,
            luxonPlugin,
          ]}
          timeZone="Asia/Seoul"
          locale={koLocale}
          initialView="timeGridWeek"
          initialDate={initialDate}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          buttonText={{ today: "오늘", month: "월", week: "주", day: "일" }}
          height="auto"
          slotMinTime="06:00:00"
          slotMaxTime="24:00:00"
          slotDuration="00:30:00"
          allDaySlot={false}
          nowIndicator
          selectable
          selectMirror
          editable
          eventDurationEditable={false}
          events={events}
          datesSet={onDatesSet}
          eventDrop={onDrop}
          eventClick={onClick}
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
