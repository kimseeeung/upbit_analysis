/** 배포·롤백 후 점검용. DB 연결은 M10 점검 항목에서 함께 확인한다. */
export function GET() {
  return Response.json({ ok: true });
}
