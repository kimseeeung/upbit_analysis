"use client";

import { useEffect, useState } from "react";

/**
 * 모바일 화면 / PC 화면 (명세 13). 처음엔 화면 너비로 자동 선택, 고른 값은 기기별 저장.
 * 모바일: 하단 탭, 일·목록 보기 위주, 표는 카드형 / PC: 왼쪽 메뉴, 주 보기 기본, 표 전체 열
 */
export type DisplayMode = "MOBILE" | "PC";
const KEY = "pt.displayMode";

function detect(): DisplayMode {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "MOBILE" || saved === "PC") return saved;
  } catch {
    /* 저장소를 쓸 수 없음 */
  }
  return window.innerWidth < 768 ? "MOBILE" : "PC";
}

export function setDisplayMode(mode: DisplayMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* 저장소를 쓸 수 없음 */
  }
  window.dispatchEvent(new CustomEvent("pt:display", { detail: mode }));
}

/** 처음 렌더(서버)는 PC로 두고, 브라우저에서 실제 값으로 바꾼다 */
export function useDisplayMode(): DisplayMode {
  const [mode, setMode] = useState<DisplayMode>("PC");
  useEffect(() => {
    // 기기 너비·저장 값은 브라우저에서만 알 수 있다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(detect());
    const on = (e: Event) => setMode((e as CustomEvent<DisplayMode>).detail);
    window.addEventListener("pt:display", on);
    return () => window.removeEventListener("pt:display", on);
  }, []);
  return mode;
}
