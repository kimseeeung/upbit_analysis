import { BellRing, CalendarCheck, ShieldCheck, Ticket } from "lucide-react";
import Image from "next/image";
import { DisplayToggle } from "@/components/DisplayToggle";
import { LinkButton } from "@/components/ui";

const FEATURES = [
  {
    icon: CalendarCheck,
    title: "한눈에 일정",
    text: "예약·확정을 한 캘린더에서",
    tone: "bg-brand-100 text-brand-600 dark:bg-brand-700/30 dark:text-brand-200",
    wide: true,
  },
  {
    icon: Ticket,
    title: "남은 횟수",
    text: "자동 계산",
    tone: "bg-pink-100 text-pink-600 dark:bg-pink-500/20 dark:text-pink-200",
  },
  {
    icon: ShieldCheck,
    title: "PIN 승인",
    text: "수업 끝나면 간단히",
    tone: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-200",
  },
  {
    icon: BellRing,
    title: "알림",
    text: "수업 전날·2시간 전에 알려 줘요",
    tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200",
    wide: true,
  },
];

export default function Home() {
  return (
    <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-7 overflow-hidden px-5 py-12 text-center">
      {/* 배경 그라데이션 방울 */}
      <div
        aria-hidden
        className="bg-brand-300/40 pointer-events-none absolute -top-24 -left-24 size-72 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-0 size-72 rounded-full bg-pink-300/40 blur-3xl"
      />
      <DisplayToggle />
      <div className="relative flex flex-col items-center gap-3">
        <Image
          src="/icons/icon.svg"
          alt="머슬매니아 아이콘"
          width={112}
          height={112}
          priority
          unoptimized
          className="shadow-brand-500/30 rounded-[32px] shadow-xl transition hover:scale-105 hover:-rotate-3"
        />
        <h1 className="from-brand-600 bg-gradient-to-r to-pink-500 bg-clip-text text-4xl font-black tracking-tight text-transparent">
          머슬매니아
        </h1>
        <p className="text-muted text-sm">
          트레이너와 수강생이 함께 쓰는 PT 일정·이용권 관리 💪
        </p>
      </div>
      <ul className="relative grid w-full grid-cols-2 gap-2 text-left text-sm">
        {FEATURES.map(({ icon: Icon, title, text, tone, wide }) => (
          <li
            key={title}
            className={`border-line bg-surface/80 flex items-center gap-3 rounded-2xl border p-3 backdrop-blur ${wide ? "col-span-2" : ""}`}
          >
            <span
              className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${tone}`}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block font-bold">{title}</span>
              <span className="text-muted text-xs">{text}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="relative flex w-full flex-col gap-2">
        <LinkButton href="/login" variant="primary" className="py-3.5">
          로그인
        </LinkButton>
        <LinkButton href="/signup" className="py-3.5">
          회원가입
        </LinkButton>
      </div>
    </main>
  );
}
