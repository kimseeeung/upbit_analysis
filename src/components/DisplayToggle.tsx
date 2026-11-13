"use client";

import { setDisplayMode, useDisplayMode } from "@/lib/display";

/** "모바일 화면 / PC 화면" 전환 */
export function DisplayToggle() {
  const mode = useDisplayMode();
  return (
    <div
      role="group"
      aria-label="화면 모드"
      className="flex overflow-hidden rounded border border-zinc-300 text-xs dark:border-zinc-700"
    >
      {(["MOBILE", "PC"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => setDisplayMode(m)}
          className={`px-2 py-0.5 ${mode === m ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : ""}`}
        >
          {m === "MOBILE" ? "모바일 화면" : "PC 화면"}
        </button>
      ))}
    </div>
  );
}
