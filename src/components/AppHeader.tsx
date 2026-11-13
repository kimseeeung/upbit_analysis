import Link from "next/link";
import { LogoutButton } from "./LogoutButton";

export function AppHeader({
  title,
  name,
  meHref,
  switchTo,
}: {
  title: string;
  name: string;
  meHref: string;
  /** 트레이너 + 센터 권한: /t ↔ /c 전환 */
  switchTo?: { href: string; label: string };
}) {
  return (
    <header className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="flex items-center gap-3">
        <span className="font-semibold">{title}</span>
        {switchTo && (
          <Link
            href={switchTo.href}
            className="rounded border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-700"
          >
            {switchTo.label}
          </Link>
        )}
      </div>
      <nav className="flex items-center gap-3 text-sm">
        <Link href={meHref}>{name}님</Link>
        <LogoutButton />
      </nav>
    </header>
  );
}
