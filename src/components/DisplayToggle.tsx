"use client";

import { Monitor, Smartphone } from "lucide-react";
import { setDisplayMode, useDisplayMode } from "@/lib/display";

/** "모바일 화면 / PC 화면" 전환 */
export function DisplayToggle({ compact = false }: { compact?: boolean }) {
  const mode = useDisplayMode();
  if (compact) {
    // 좁은 상단 바: 아이콘 하나로 전환
    const next = mode === "MOBILE" ? "PC" : "MOBILE";
    const Icon = next === "PC" ? Monitor : Smartphone;
    return (
      <button
        type="button"
        aria-label={next === "PC" ? "PC 화면으로 보기" : "모바일 화면으로 보기"}
        title={next === "PC" ? "PC 화면" : "모바일 화면"}
        onClick={() => setDisplayMode(next)}
        className="text-muted hover:bg-fill inline-flex size-9 items-center justify-center rounded-full"
      >
        <Icon className="size-5" aria-hidden />
      </button>
    );
  }
  return (
    <div
      role="group"
      aria-label="화면 모드"
      className="bg-fill inline-flex rounded-full p-0.5 text-xs"
    >
      {(["MOBILE", "PC"] as const).map((m) => {
        const Icon = m === "MOBILE" ? Smartphone : Monitor;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setDisplayMode(m)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold whitespace-nowrap transition ${
              mode === m
                ? "bg-surface text-brand-600 dark:text-brand-100 shadow-sm"
                : "text-muted"
            }`}
          >
            <Icon className="size-3.5" aria-hidden />
            {m === "MOBILE" ? "모바일 화면" : "PC 화면"}
          </button>
        );
      })}
    </div>
  );
}
