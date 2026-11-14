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
  const mobile = mode === "MOBILE";
  const me = (
    <Link
      href={meHref}
      aria-label={`${name}님 내 정보`}
      className="hover:bg-fill inline-flex min-w-0 items-center gap-1.5 rounded-full py-1 pr-2 pl-1"
    >
      <span className="bg-brand-100 text-brand-700 dark:bg-brand-700/30 dark:text-brand-100 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">
        {name.slice(0, 1)}
      </span>
      {!mobile && (
        <span className="truncate text-sm font-semibold">{name}님</span>
      )}
    </Link>
  );

  // 한 줄 상단 바: 왼쪽 로고, 오른쪽 아이콘 버튼
  const header = (
    <header className="border-line bg-surface sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Logo sub={mobile ? undefined : sub} />
        {switchLink}
      </div>
      <div className="flex items-center gap-1 text-sm whitespace-nowrap">
        <DisplayToggle compact={mobile} />
        {me}
        <LogoutButton compact={mobile} />
      </div>
    </header>
  );

  // 모바일/PC가 바뀌어도 본문(children)은 같은 자리에 두어 입력 중인 내용이 사라지지 않게 한다
  return (
    <>
      {header}
      <div className="flex flex-1">
        {!mobile && (
          <nav
            aria-label="주 메뉴"
            className="bg-surface border-line sticky top-14 flex h-[calc(100vh-3.5rem)] w-56 shrink-0 flex-col gap-0.5 border-r p-3 text-[15px]"
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
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100 font-bold"
                      : "text-muted hover:bg-fill hover:text-foreground"
                  }`}
                >
                  <Icon className="size-[18px]" aria-hidden />
                  {t.label}
                </Link>
              );
            })}
          </nav>
        )}
        <main
          className={
            mobile
              ? "mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-3 py-4 pb-28"
              : "mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-6"
          }
        >
          {children}
        </main>
      </div>
      {mobile && (
        <nav
          aria-label="주 메뉴"
          className="bg-surface border-line fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t pb-[max(env(safe-area-inset-bottom),0.25rem)]"
        >
          {tabs.map((t) => {
            const Icon = tabIcon(t.href);
            const active = isActive(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-16 flex-1 flex-col items-center gap-1 px-1 pt-2 pb-1.5 text-[11px] whitespace-nowrap transition ${
                  active
                    ? "text-brand-600 dark:text-brand-200 font-bold"
                    : "text-muted"
                }`}
              >
                <Icon
                  className="size-6"
                  strokeWidth={active ? 2.3 : 1.8}
                  aria-hidden
                />
                {t.label}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
