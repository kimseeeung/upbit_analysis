import { Suspense, type ReactNode } from "react";
import { homePathFor } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/guard";
import { PageShell } from "@/components/ui";

async function Gate({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const s = await requireUser();
  const home = homePathFor(s.principal);
  return (
    <PageShell
      title={title}
      back={{ href: `${home === "/" ? "" : home}/me`, label: "내 정보" }}
    >
      {children}
    </PageShell>
  );
}

/** 내 정보 > 공지사항·문의 (모든 회원 유형 공통) */
export function MeShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Suspense
      fallback={<p className="p-6 text-sm text-zinc-500">불러오는 중…</p>}
    >
      <Gate title={title}>{children}</Gate>
    </Suspense>
  );
}
