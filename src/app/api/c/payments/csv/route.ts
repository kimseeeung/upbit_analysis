import { getDb } from "@/lib/db";
import { getCenterPayments, paymentsCsv } from "@/server/center/center-views";
import { requireApiSession, route } from "@/server/http";

export const GET = route(async (request) => {
  const s = await requireApiSession(["CENTER_ADMIN", "TRAINER"]);
  const u = new URL(request.url);
  const from = u.searchParams.get("from") ?? "";
  const to = u.searchParams.get("to") ?? "";
  const r = await getCenterPayments(getDb(), s.principal.userId, from, to);
  return new Response(paymentsCsv(r.items), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`결제기록_${from}_${to}.csv`)}`,
    },
  });
});
