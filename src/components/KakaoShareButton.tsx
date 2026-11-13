"use client";

import { useState } from "react";
import { NIGHT_NOTICE, NIGHT_SHARE_CONFIRM, isNight } from "@/lib/notify/night";
import { api } from "./api";
import { Button, Notice } from "./ui";

type Purpose = "CONFIRM_BOOKING" | "APPROVE" | "RULE_CONSENT" | "LINK_REQUEST";

declare global {
  interface Window {
    Kakao?: {
      isInitialized(): boolean;
      init(key: string): void;
      Share: { sendDefault(o: unknown): void };
    };
  }
}

let sdk: Promise<boolean> | null = null;
/** 카카오 JavaScript SDK (키가 있을 때만) */
function loadKakao(): Promise<boolean> {
  if (sdk) return sdk;
  sdk = (async () => {
    const r = await api<{ key: string | null }>("/api/kakao-key");
    if (!r.ok || !r.data.key) return false;
    if (!window.Kakao) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";
        s.crossOrigin = "anonymous";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("load"));
        document.head.appendChild(s);
      });
    }
    if (window.Kakao && !window.Kakao.isInitialized())
      window.Kakao.init(r.data.key);
    return !!window.Kakao;
  })().catch(() => false);
  return sdk;
}

/**
 * "카톡으로 보내기" (8.1): 사용자가 눌러서 보낸다. 야간이면 확인창, 버튼 아래 주석 문구.
 * 카카오 키가 없으면 기기의 공유 기능 또는 링크 복사로 대신한다.
 */
export function KakaoShareButton({
  purpose,
  refId,
  label = "카톡으로 보내기",
}: {
  purpose: Purpose;
  refId: string;
  label?: string;
}) {
  const [msg, setMsg] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function share() {
    setMsg(null);
    if (isNight(new Date()) && !window.confirm(NIGHT_SHARE_CONFIRM)) return;
    const r = await api<{ url: string; text: string }>("/api/t/share", {
      body: { purpose, refId },
    });
    if (!r.ok) return setMsg({ tone: "error", text: r.message });
    const { url, text } = r.data;
    setLink(url);
    if (await loadKakao()) {
      window.Kakao!.Share.sendDefault({
        objectType: "text",
        text,
        link: { mobileWebUrl: url, webUrl: url },
        buttonTitle: "열기",
      });
      return setMsg({ tone: "success", text: "카카오톡 공유 창을 열었습니다" });
    }
    if (navigator.share) {
      try {
        await navigator.share({ text, url });
        return setMsg({ tone: "success", text: "공유했습니다" });
      } catch {
        /* 취소 */
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setMsg({
        tone: "info",
        text: "링크를 복사했습니다. 카카오톡에 붙여 넣어 보내 주세요",
      });
    } catch {
      setMsg({ tone: "info", text: "아래 링크를 카카오톡으로 보내 주세요" });
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="secondary" onClick={share}>
        {label}
      </Button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {link && (
        <p className="text-xs break-all text-zinc-500" data-testid="share-link">
          {link}
        </p>
      )}
      <p className="text-xs text-zinc-500">{NIGHT_NOTICE}</p>
    </div>
  );
}
