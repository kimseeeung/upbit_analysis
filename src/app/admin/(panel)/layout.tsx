import Link from "next/link";
import { Suspense } from "react";
import { Loading, Logo } from "@/components/ui";
import { requireOperatorPage } from "@/server/admin/http";
import { AdminLogout } from "./AdminLogout";

const MENU = [
  { href: "/admin/versions", label: "버전·롤백" },
  { href: "/admin/operators", label: "관리자" },
  { href: "/admin/users", label: "회원 조회" },
  { href: "/admin/notifications", label: "알림 발송 내역" },
  { href: "/admin/notices", label: "공지사항" },
  { href: "/admin/inquiries", label: "문의" },
];

async function Gate({ children }: { children: React.ReactNode }) {
  const op = await requireOperatorPage();
  return (
    <>
      <header className="border-line flex items-center justify-between border-b px-4 py-3">
        <Logo sub="운영" />
        <div className="flex items-center gap-3 text-sm">
          <span>{op.name}님</span>
          <AdminLogout />
        </div>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <nav
          aria-label="운영 메뉴"
          className="border-line flex shrink-0 gap-1 overflow-x-auto border-b p-2 text-sm md:w-44 md:flex-col md:border-r md:border-b-0"
        >
          {MENU.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="hover:bg-brand-50 dark:hover:bg-brand-700/20 rounded px-3 py-2 whitespace-nowrap"
            >
              {m.label}
            </Link>
          ))}
        </nav>
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-6">
          {children}
        </main>
      </div>
    </>
  );
}

/** 운영 관리자 화면 틀. 세션·IP는 서버에서 매 요청 검사 */
export default function AdminPanelLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<Loading />}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
