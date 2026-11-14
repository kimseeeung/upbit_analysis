"use client";

import { Monitor, Smartphone } from "lucide-react";
import { setDisplayMode, useDisplayMode } from "@/lib/display";

/** "모바일 화면 / PC 화면" 전환 */
export function DisplayToggle() {
  const mode = useDisplayMode();
  return (
    <div
      role="group"
      aria-label="화면 모드"
      className="bg-brand-50 dark:bg-brand-700/20 inline-flex rounded-full p-0.5 text-xs"
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
