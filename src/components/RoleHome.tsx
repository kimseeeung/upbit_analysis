import { Suspense, type ReactNode } from "react";
import type { Area } from "@/lib/auth/access";
import { requireArea } from "@/lib/auth/guard";
import { getCurrentSession } from "@/server/auth/current";
import { AppHeader } from "./AppHeader";

const AREA_META: Record<
  "trainer" | "student" | "center",
  { title: string; me: string }
> = {
  trainer: { title: "PT 관리 · 트레이너", me: "/t/me" },
  student: { title: "PT 관리", me: "/s/me" },
  center: { title: "PT 관리 · 센터", me: "/c/me" },
};

async function Gated({
  area,
  children,
}: {
  area: "trainer" | "student" | "center";
  children: ReactNode;
}) {
  const principal = await requireArea(area as Area);
  const session = await getCurrentSession();
  const meta = AREA_META[area];
  const hasCenter =
    principal.kind === "user" &&
    principal.role === "TRAINER" &&
    principal.hasCenterAdmin;
  const switchTo =
    hasCenter && area === "trainer"
      ? { href: "/c", label: "센터 화면" }
      : principal.kind === "user" &&
          principal.role === "TRAINER" &&
          area === "center"
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
  area: "trainer" | "student" | "center";
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
