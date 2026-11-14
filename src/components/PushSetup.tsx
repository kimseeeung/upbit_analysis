"use client";

import { useEffect, useState } from "react";
import { NIGHT_NOTICE } from "@/lib/notify/night";
import { api } from "./api";
import { Button, Notice } from "./ui";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type State = "checking" | "unsupported" | "denied" | "off" | "on";

/** 웹 푸시 알림 허용·구독 (홈 화면에 추가한 앱에서) */
export function PushSetup({ showNotice = true }: { showNotice?: boolean }) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        typeof Notification === "undefined"
      ) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setError(null);
    const permission = await Notification.requestPermission();
    if (permission !== "granted")
      return setState(permission === "denied" ? "denied" : "off");
    const key = await api<{ publicKey: string | null }>("/api/push/vapid");
    if (!key.ok || !key.data.publicKey) {
      setError("알림 서버 설정이 아직 준비되지 않았습니다");
      return;
    }
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key.data.publicKey),
    });
    const r = await api("/api/push/subscribe", { body: sub.toJSON() });
    if (r.ok) setState("on");
    else setError(r.message);
  }

  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api("/api/push/subscribe", {
        method: "DELETE",
        body: { endpoint: sub.endpoint },
      });
      await sub.unsubscribe();
    }
    setState("off");
  }

  return (
    <div className="flex flex-col gap-2">
      {state === "on" && (
        <Notice tone="success">이 기기에서 알림을 받고 있습니다.</Notice>
      )}
      {state === "off" && <Button onClick={enable}>알림 허용</Button>}
      {state === "on" && (
        <Button variant="ghost" onClick={disable}>
          이 기기 알림 끄기
        </Button>
      )}
      {state === "denied" && (
        <Notice tone="warning">
          알림이 차단되었습니다. 브라우저 설정에서 알림을 허용해야 자동 알림을
          받을 수 있습니다.
        </Notice>
      )}
      {state === "unsupported" && (
        <Notice tone="warning">
          이 브라우저에서는 알림을 받을 수 없습니다. 홈 화면에 추가한 앱(Android
          크롬, iPhone iOS 16.4 이상)에서 허용해 주세요.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {showNotice && <p className="text-muted text-xs">{NIGHT_NOTICE}</p>}
    </div>
  );
}
