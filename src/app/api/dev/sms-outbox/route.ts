import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { isDevOutboxEnabled, readDevOutbox } from "@/server/sms/sender";

/** 개발·E2E 전용. SMS_PROVIDER=console + SMS_DEV_OUTBOX=1 일 때만 열린다. */
export function GET(request: Request) {
  if (!isDevOutboxEnabled()) return new NextResponse(null, { status: 404 });
  const phone = new URL(request.url).searchParams.get("phone");
  return NextResponse.json({
    messages: readDevOutbox(phone ? normalizePhone(phone) : undefined),
  });
}
