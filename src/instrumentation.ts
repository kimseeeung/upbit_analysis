/** 서버가 뜰 때 한 번: 예약 작업(pg-boss) 시작 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.JOBS_ENABLED !== "1") return;
  const { startJobs } = await import("@/server/jobs/boss");
  await startJobs();
}
