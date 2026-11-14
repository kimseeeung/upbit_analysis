"use client";

import {
  BarChart3,
  Building2,
  CalendarDays,
  CreditCard,
  Home,
  Inbox,
  Send,
  Settings,
  Ticket,
  UserRound,
  Users,
  Dumbbell,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useDisplayMode } from "@/lib/display";
import { DisplayToggle } from "./DisplayToggle";
import { LogoutButton } from "./LogoutButton";
import { Logo } from "./ui";

export interface ShellProps {
  title: string;
  name: string;
  meHref: string;
  switchTo?: { href: string; label: string };
  tabs: { href: string; label: string }[];
  children: ReactNode;
}

/** 메뉴 아이콘 (경로로 고름) */
const TAB_ICONS: [RegExp, LucideIcon][] = [
  [/^\/s$/, Home],
  [/^\/(t|c)$/, CalendarDays],
  [/students$/, Users],
  [/trainers$/, Dumbbell],
  [/requests$/, Inbox],
  [/stats$/, BarChart3],
  [/manual-notify$/, Send],
  [/payments$/, CreditCard],
  [/passes$/, Ticket],
  [/settings$/, Settings],
  [/me$/, UserRound],
];
function tabIcon(href: string): LucideIcon {
  return TAB_ICONS.find(([re]) => re.test(href))?.[1] ?? Building2;
}

function isActive(pathname: string, href: string) {
  return href.length <= 2
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

/** 역할별 화면 틀: 모바일은 하단 탭, PC는 왼쪽 메뉴 (13장) */
export function AppShell({
  title,
  name,
  meHref,
  switchTo,
  tabs,
  children,
}: ShellProps) {
  const mode = useDisplayMode();
  const pathname = usePathname();
  const sub = title.split(" · ")[1];
  const switchLink = switchTo && (
    <Link
      href={switchTo.href}
      className="bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-700/20 dark:text-brand-100 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
    >
      {switchTo.label}
    </Link>
  );
  const me = (
    <Link
      href={meHref}
      className="hover:bg-brand-50 dark:hover:bg-brand-700/20 inline-flex min-w-0 items-center gap-1.5 rounded-full py-1 pr-2 pl-1"
    >
      <span className="from-brand-300 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br to-pink-300 text-xs font-bold text-white">
        {name.slice(0, 1)}
      </span>
      <span className="truncate">{name}님</span>
    </Link>
  );

  // 모바일: 좁은 화면에서 글자가 깨지지 않게 두 줄로 나눔
  const header =
    mode === "MOBILE" ? (
      <header className="border-line bg-surface/90 sticky top-0 z-30 flex flex-col gap-2 border-b px-4 py-2.5 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Logo sub={sub} />
            {switchLink}
          </div>
          <div className="text-sm whitespace-nowrap">
            <LogoutButton />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <DisplayToggle />
          {me}
        </div>
      </header>
    ) : (
      <header className="border-line bg-surface/90 sticky top-0 z-30 flex items-center justify-between gap-2 border-b px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Logo sub={sub} />
          {switchLink}
        </div>
        <div className="flex items-center gap-3 text-sm whitespace-nowrap">
          <DisplayToggle />
          {me}
          <LogoutButton />
        </div>
      </header>
    );

  if (mode === "MOBILE") {
    return (
      <>
        {header}
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-5 pb-28">
          {children}
        </main>
        <nav
          aria-label="주 메뉴"
          className="border-line bg-surface/95 fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t px-1 pt-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] backdrop-blur"
        >
          {tabs.map((t) => {
            const Icon = tabIcon(t.href);
            const active = isActive(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-16 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] whitespace-nowrap transition ${
                  active
                    ? "text-brand-600 dark:text-brand-200 font-bold"
                    : "text-muted"
                }`}
              >
                <span
                  className={`inline-flex h-7 w-11 items-center justify-center rounded-full transition ${
                    active ? "bg-brand-100 dark:bg-brand-700/30" : ""
                  }`}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                {t.label}
              </Link>
            );
          })}
        </nav>
      </>
    );
  }
  return (
    <>
      {header}
      <div className="flex flex-1">
        <nav
          aria-label="주 메뉴"
          className="border-line bg-surface sticky top-[61px] flex h-[calc(100vh-61px)] w-52 shrink-0 flex-col gap-1 border-r p-3 text-sm"
        >
          {tabs.map((t) => {
            const Icon = tabIcon(t.href);
            const active = isActive(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition ${
                  active
                    ? "bg-brand-500 shadow-brand-500/30 font-semibold text-white shadow-sm"
                    : "text-muted hover:bg-brand-50 hover:text-foreground dark:hover:bg-brand-700/20"
                }`}
              >
                <Icon className="size-[18px]" aria-hidden />
                {t.label}
              </Link>
            );
          })}
        </nav>
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-6 py-6">
          {children}
        </main>
      </div>
    </>
  );
}
