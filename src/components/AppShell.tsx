"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useDisplayMode } from "@/lib/display";
import { DisplayToggle } from "./DisplayToggle";
import { LogoutButton } from "./LogoutButton";

export interface ShellProps {
  title: string;
  name: string;
  meHref: string;
  switchTo?: { href: string; label: string };
  tabs: { href: string; label: string }[];
  children: ReactNode;
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
  const switchLink = switchTo && (
    <Link
      href={switchTo.href}
      className="rounded border border-zinc-300 px-2 py-0.5 text-xs whitespace-nowrap dark:border-zinc-700"
    >
      {switchTo.label}
    </Link>
  );
  // 모바일: 좁은 화면에서 글자가 깨지지 않게 두 줄로 나눔
  const header =
    mode === "MOBILE" ? (
      <header className="flex flex-col gap-2 border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold whitespace-nowrap">
              {title}
            </span>
            {switchLink}
          </div>
          <div className="text-sm whitespace-nowrap">
            <LogoutButton />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <DisplayToggle />
          <Link href={meHref} className="truncate whitespace-nowrap">
            {name}님
          </Link>
        </div>
      </header>
    ) : (
      <header className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <span className="font-semibold whitespace-nowrap">{title}</span>
          {switchLink}
        </div>
        <div className="flex items-center gap-3 text-sm whitespace-nowrap">
          <DisplayToggle />
          <Link href={meHref}>{name}님</Link>
          <LogoutButton />
        </div>
      </header>
    );
  const link = (t: { href: string; label: string }, cls: string) => (
    <Link
      key={t.href}
      href={t.href}
      aria-current={isActive(pathname, t.href) ? "page" : undefined}
      className={`${cls} ${isActive(pathname, t.href) ? "font-semibold text-zinc-900 dark:text-white" : "text-zinc-600 dark:text-zinc-300"}`}
    >
      {t.label}
    </Link>
  );

  if (mode === "MOBILE") {
    return (
      <>
        {header}
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-6 pb-24">
          {children}
        </main>
        <nav
          aria-label="주 메뉴"
          className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          {tabs.map((t) =>
            link(t, "flex-1 px-3 py-3 text-center whitespace-nowrap"),
          )}
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
          className="flex w-44 shrink-0 flex-col gap-1 border-r border-zinc-200 p-3 text-sm dark:border-zinc-800"
        >
          {tabs.map((t) =>
            link(
              t,
              "rounded px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800",
            ),
          )}
        </nav>
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-6 py-6">
          {children}
        </main>
      </div>
    </>
  );
}
