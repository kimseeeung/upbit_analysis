/**
 * 웹 푸시 발송 어댑터. VAPID 키는 환경 변수에서만 읽는다.
 * 키가 없으면(개발·테스트) 실제로 보내지 않고 메모리에 남긴다.
 */

import { sendNotification, setVapidDetails } from "web-push";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  id: string;
  title: string;
  body: string;
  url?: string | null;
  actions?: { action: string; title: string }[];
}

export type PushResult =
  { ok: true } | { ok: false; gone: boolean; reason: string };

export interface PushSender {
  readonly name: string;
  send(target: PushTarget, payload: PushPayload): Promise<PushResult>;
}

class WebPushSender implements PushSender {
  readonly name = "web-push";
  constructor(publicKey: string, privateKey: string, subject: string) {
    setVapidDetails(subject, publicKey, privateKey);
  }
  async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    try {
      await sendNotification(
        {
          endpoint: target.endpoint,
          keys: { p256dh: target.p256dh, auth: target.auth },
        },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 12 },
      );
      return { ok: true };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode ?? 0;
      return {
        ok: false,
        gone: status === 404 || status === 410,
        reason: `HTTP_${status || "ERROR"}`,
      };
    }
  }
}

export interface MemoryPush {
  endpoint: string;
  payload: PushPayload;
  at: string;
}

const store = globalThis as unknown as { __ptPushOutbox?: MemoryPush[] };

/** 개발·테스트용: 보내지 않고 기록만 */
export class MemoryPushSender implements PushSender {
  readonly name = "memory";
  async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    if (target.endpoint.includes("gone"))
      return { ok: false, gone: true, reason: "HTTP_410" };
    if (!store.__ptPushOutbox) store.__ptPushOutbox = [];
    store.__ptPushOutbox.push({
      endpoint: target.endpoint,
      payload,
      at: new Date().toISOString(),
    });
    if (store.__ptPushOutbox.length > 200) store.__ptPushOutbox.splice(0, 100);
    return { ok: true };
  }
}

export function readMemoryPushOutbox(): MemoryPush[] {
  return [...(store.__ptPushOutbox ?? [])];
}

let sender: PushSender | null = null;

export function getPushSender(): PushSender {
  if (sender) return sender;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  sender =
    pub && priv && subject
      ? new WebPushSender(pub, priv, subject)
      : new MemoryPushSender();
  return sender;
}

export function setPushSenderForTest(s: PushSender | null) {
  sender = s;
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}
