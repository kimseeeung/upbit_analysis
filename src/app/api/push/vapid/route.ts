import { NextResponse } from "next/server";
import { vapidPublicKey } from "@/server/notify/push-sender";

/** 웹 푸시 구독에 쓰는 VAPID 공개키 (공개해도 되는 값) */
export function GET() {
  return NextResponse.json({ publicKey: vapidPublicKey() });
}
