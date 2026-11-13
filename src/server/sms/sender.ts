/**
 * SMS 발송 어댑터. 본인인증 번호 전용(명세 8.1).
 * 대행사가 정해지면 SmsSender를 구현한 어댑터를 추가하고 SMS_PROVIDER로 고른다.
 * 키는 환경 변수(SMS_API_KEY 등)에서만 읽는다.
 */

import { maskPhone } from "@/lib/phone";

export interface SmsSender {
  readonly name: string;
  send(to: string, text: string): Promise<void>;
}

export interface OutboxMessage {
  to: string;
  text: string;
  at: string;
}

const globalStore = globalThis as unknown as {
  __ptSmsOutbox?: OutboxMessage[];
};

function outbox(): OutboxMessage[] {
  if (!globalStore.__ptSmsOutbox) globalStore.__ptSmsOutbox = [];
  return globalStore.__ptSmsOutbox;
}

/** 개발용: 서버 콘솔에 출력. 개발 보조 outbox에도 최근 50건을 남긴다. */
export class ConsoleSmsSender implements SmsSender {
  readonly name = "console";
  async send(to: string, text: string): Promise<void> {
    console.info(`[SMS:console] to=${maskPhone(to)} ${text}`);
    const box = outbox();
    box.push({ to, text, at: new Date().toISOString() });
    if (box.length > 50) box.splice(0, box.length - 50);
  }
}

/** 개발·E2E 테스트에서만 켜는 outbox 조회 (SMS_PROVIDER=console + SMS_DEV_OUTBOX=1) */
export function isDevOutboxEnabled(): boolean {
  return (
    (process.env.SMS_PROVIDER ?? "console") === "console" &&
    process.env.SMS_DEV_OUTBOX === "1"
  );
}

export function readDevOutbox(phone?: string): OutboxMessage[] {
  if (!isDevOutboxEnabled()) return [];
  const box = outbox();
  return phone ? box.filter((m) => m.to === phone) : [...box];
}

let sender: SmsSender | null = null;

export function getSmsSender(): SmsSender {
  if (sender) return sender;
  const provider = process.env.SMS_PROVIDER ?? "console";
  switch (provider) {
    case "console":
      sender = new ConsoleSmsSender();
      break;
    default:
      throw new Error(`지원하지 않는 SMS_PROVIDER: ${provider}`);
  }
  return sender;
}

/** 테스트에서 다른 어댑터로 바꿀 때 */
export function setSmsSenderForTest(s: SmsSender | null): void {
  sender = s;
}
