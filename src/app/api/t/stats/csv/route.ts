import { getDb } from "@/lib/db";
import { toCsv } from "@/lib/stats/stats";
import { requireApiSession, route } from "@/server/http";
import { getTrainerStats } from "@/server/stats/stats-service";

/** 엑셀 다운로드 (CSV, UTF-8 BOM) */
export const GET = route(async (request) => {
  const s = await requireApiSession(["TRAINER"]);
  const u = new URL(request.url);
  const from = u.searchParams.get("from") ?? "";
  const to = u.searchParams.get("to") ?? "";
  const { rows } = await getTrainerStats(getDb(), s.principal.userId, from, to);
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`수강현황_${from}_${to}.csv`)}`,
    },
  });
});
