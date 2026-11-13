"use client";

import type {
  DatesSetArg,
  EventClickArg,
  EventInput,
} from "@fullcalendar/core";
import koLocale from "@fullcalendar/core/locales/ko";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { api } from "@/components/api";
import {
  STATUS_STYLE,
  fmtDateTime,
  fmtRange,
  kstDateKey,
} from "@/components/fmt";
import { Button, Card, Modal, Notice } from "@/components/ui";
import {
  StudentBookingSheet,
  type StudentBooking,
} from "./StudentBookingSheet";

interface Data {
  pauses?: {
    studentId: string;
    studentName: string;
    startDate: string;
    endDate: string;
  }[];
  hasTrainer: boolean;
  hasAvailability: boolean;
  summary: {
    nextBooking: { startAt: string; status: string } | null;
    remaining: number;
    total: number;
    expiry: string | null;
    availableToday: number;
  };
  slots: { start: string; end: string }[];
  bookings: StudentBooking[];
}

export function StudentCalendar() {
  const initialDate = useSearchParams().get("date") ?? undefined;
  const [data, setData] = useState<Data | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ start: string; end: string } | null>(null);
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const load = useCallback(async (r: { from: string; to: string }) => {
    const res = await api<Data>(`/api/s/calendar?from=${r.from}&to=${r.to}`);
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
    const list: EventInput[] = data.bookings
      .filter((b) => !["REJECTED", "EXPIRED"].includes(b.status))
      .map((b) => ({
        id: b.id,
        title: `${b.needsAction ? "● " : ""}${STATUS_STYLE[b.status].label}`,
        start: b.startAt,
        end: b.endAt,
        backgroundColor: STATUS_STYLE[b.status].color,
        borderColor: b.needsAction ? "#dc2626" : STATUS_STYLE[b.status].color,
        classNames: [`booking-${b.id}`],
        extendedProps: { kind: "booking" },
      }));
    if (data.hasAvailability) {
      data.slots.forEach((s, i) =>
        list.push({
          id: `slot-${i}`,
          title: "예약 가능",
          start: s.start,
          end: s.end,
          backgroundColor: "#dcfce7",
          borderColor: "#86efac",
          textColor: "#166534",
          extendedProps: { kind: "slot", start: s.start, end: s.end },
        }),
      );
    }
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
  }, [data]);

  function onClick(arg: EventClickArg) {
    if (arg.event.extendedProps.kind === "booking") setSelected(arg.event.id);
    else
      setSlot({
        start: arg.event.extendedProps.start as string,
        end: arg.event.extendedProps.end as string,
      });
  }

  async function requestSlot() {
    if (!slot) return;
    const r = await api("/api/s/bookings", { body: { startAt: slot.start } });
    setSlot(null);
    setMsg(
      r.ok
        ? {
            tone: "success",
            text: "예약을 신청했습니다. 트레이너가 수락하면 확정됩니다",
          }
        : { tone: "error", text: r.message },
    );
    void reload();
  }

  const s = data?.summary;
  const selectedBooking = data?.bookings.find((b) => b.id === selected) ?? null;
  return (
    <div className="flex flex-col gap-3">
      {s && (
        <Card>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div>
              <p className="text-xs text-zinc-500">다음 수업</p>
              <p className="font-medium">
                {s.nextBooking ? fmtDateTime(s.nextBooking.startAt) : "없음"}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">잔여 / 전체</p>
              <p className="font-medium">
                {s.remaining} / {s.total}회
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">만료일</p>
              <p className="font-medium">{s.expiry ?? "-"}</p>
            </div>
          </div>
        </Card>
      )}
      {data && !data.hasTrainer && (
        <Notice tone="warning">
          담당 트레이너와 연결되면 예약할 수 있습니다.
        </Notice>
      )}
      {data && data.hasTrainer && !data.hasAvailability && (
        <Notice>트레이너가 예약 가능 시간을 아직 열지 않았습니다.</Notice>
      )}
      {data && data.hasAvailability && (
        <p className="text-xs text-zinc-500">
          초록색 &quot;예약 가능&quot; 칸을 눌러 신청합니다. 수업 12시간 전까지
          신청할 수 있습니다.
        </p>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="text-sm [&_.fc-toolbar-title]:text-base">
        <FullCalendar
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
            right: "dayGridMonth,timeGridWeek",
          }}
          buttonText={{ today: "오늘", month: "월", week: "주" }}
          height="auto"
          slotMinTime="00:00:00"
          scrollTime="07:00:00"
          slotMaxTime="24:00:00"
          allDaySlot={false}
          nowIndicator
          editable={false}
          events={events}
          datesSet={onDatesSet}
          eventClick={onClick}
        />
      </div>
      {slot && (
        <Modal title="예약 신청" onClose={() => setSlot(null)}>
          <p className="text-sm">
            {fmtRange(slot.start, slot.end)}에 예약을 신청할까요?
          </p>
          <p className="text-xs text-zinc-500">
            트레이너가 수락하면 확정됩니다. 대기 중인 신청은 3건까지입니다.
          </p>
          <Button onClick={requestSlot}>신청하기</Button>
        </Modal>
      )}
      {selectedBooking && (
        <StudentBookingSheet
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
