import { NextResponse } from "next/server";

/** 카카오 JavaScript 키 (브라우저 SDK용 공개 키, 카카오 콘솔에서 도메인 제한) */
export function GET() {
  return NextResponse.json({ key: process.env.KAKAO_JS_KEY || null });
}
