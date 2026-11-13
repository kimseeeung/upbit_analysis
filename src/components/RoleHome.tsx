import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import type { Area } from "@/lib/auth/access";
import { requireArea } from "@/lib/auth/guard";
import { getCurrentSession } from "@/server/auth/current";
import { AppHeader } from "./AppHeader";

type RoleArea = "trainer" | "student" | "center";

const AREA_META: Record<
  RoleArea,
  { title: string; me: string; tabs: { href: string; label: string }[] }
> = {
  trainer: {
    title: "PT 관리 · 트레이너",
    me: "/t/me",
    tabs: [
      { href: "/t", label: "캘린더" },
      { href: "/t/students", label: "수강생" },
      { href: "/t/requests", label: "요청함" },
      { href: "/t/manual-notify", label: "직접 보낼 알림" },
      { href: "/t/settings", label: "설정" },
    ],
  },
  student: {
    title: "PT 관리",
    me: "/s/me",
    tabs: [
      { href: "/s", label: "홈" },
      { href: "/s/requests", label: "요청함" },
      { href: "/s/passes", label: "이용권" },
      { href: "/s/me", label: "내 정보" },
    ],
  },
  center: {
    title: "PT 관리 · 센터",
    me: "/c/me",
    tabs: [{ href: "/c", label: "센터 캘린더" }],
  },
};

async function Gated({
  area,
  children,
}: {
  area: RoleArea;
  children: ReactNode;
}) {
  const principal = await requireArea(area as Area);
  const session = await getCurrentSession();
  const meta = AREA_META[area];
  const isTrainer = principal.kind === "user" && principal.role === "TRAINER";
  const switchTo =
    isTrainer && area === "trainer" && principal.hasCenterAdmin
      ? { href: "/c", label: "센터 화면" }
      : isTrainer && area === "center"
        ? { href: "/t", label: "트레이너 화면" }
        : undefined;
  return (
    <>
      <AppHeader
        title={meta.title}
        name={session?.userName ?? ""}
        meHref={meta.me}
        switchTo={switchTo}
      />
      <nav
        aria-label="주 메뉴"
        className="flex gap-1 overflow-x-auto border-b border-zinc-200 px-2 text-sm dark:border-zinc-800"
      >
        {meta.tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="px-3 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-300"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-6">
        {children}
      </main>
    </>
  );
}

/** 역할별 화면 틀. 권한은 서버에서 매 요청 검사한다(requireArea). */
export function RoleLayout({
  area,
  children,
}: {
  area: RoleArea;
  children: ReactNode;
}) {
  return (
    <Suspense
      fallback={<p className="p-6 text-sm text-zinc-500">불러오는 중…</p>}
    >
      <Gated area={area}>{children}</Gated>
    </Suspense>
  );
}
