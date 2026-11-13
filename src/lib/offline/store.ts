"use client";

/**
 * 휴대폰 백업과 임시 변경 큐 (명세 11). 브라우저 IndexedDB(Dexie).
 * - 저장 데이터는 AES-GCM으로 암호화. 키는 내보낼 수 없는(non-extractable) WebCrypto 키로 같은 DB에 둔다
 * - 로그아웃하면 전부 지운다
 */

import Dexie, { type Table } from "dexie";

interface KvRow {
  key: string;
  value: unknown;
}

export interface QueueRow {
  id: string;
  createdAt: string;
  device: string;
  op: { kind: string; payload: Record<string, unknown> };
  /** 화면 표시용 설명 */
  label: string;
}

class OfflineDb extends Dexie {
  kv!: Table<KvRow, string>;
  queue!: Table<QueueRow, string>;
  constructor() {
    super("pt-offline");
    this.version(1).stores({ kv: "key", queue: "id, createdAt" });
  }
}

let dbi: OfflineDb | null = null;
function db(): OfflineDb {
  if (!dbi) dbi = new OfflineDb();
  return dbi;
}

async function key(): Promise<CryptoKey> {
  const row = await db().kv.get("cryptoKey");
  if (row?.value) return row.value as CryptoKey;
  const k = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  await db().kv.put({ key: "cryptoKey", value: k });
  return k;
}

async function encrypt(value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return { iv, data };
}

async function decrypt<T>(box: {
  iv: Uint8Array;
  data: ArrayBuffer;
}): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: box.iv as BufferSource },
    await key(),
    box.data,
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export async function putEncrypted(name: string, value: unknown) {
  await db().kv.put({ key: `enc:${name}`, value: await encrypt(value) });
}

export async function getEncrypted<T>(name: string): Promise<T | null> {
  const row = await db().kv.get(`enc:${name}`);
  if (!row?.value) return null;
  try {
    return await decrypt<T>(row.value as { iv: Uint8Array; data: ArrayBuffer });
  } catch {
    return null;
  }
}

export async function getMeta<T>(name: string): Promise<T | null> {
  return ((await db().kv.get(`meta:${name}`))?.value as T) ?? null;
}

export async function setMeta(name: string, value: unknown) {
  await db().kv.put({ key: `meta:${name}`, value });
}

/** 로그아웃 시 백업·큐·키 모두 삭제 */
export async function clearOffline() {
  try {
    await db().delete();
  } catch {
    /* 없는 DB */
  }
  dbi = null;
}

// ── 임시 변경 큐 ──

function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac/.test(ua)
          ? "Mac"
          : "기기";
  return `${os} · 오프라인`;
}

export async function enqueue(op: QueueRow["op"], label: string) {
  const row: QueueRow = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    device: deviceLabel(),
    op,
    label,
  };
  await db().queue.put(row);
  window.dispatchEvent(new CustomEvent("pt:queue"));
  return row;
}

export async function listQueue(): Promise<QueueRow[]> {
  try {
    return await db().queue.orderBy("createdAt").toArray();
  } catch {
    return [];
  }
}

export async function removeQueued(ids: string[]) {
  await db().queue.bulkDelete(ids);
  window.dispatchEvent(new CustomEvent("pt:queue"));
}
