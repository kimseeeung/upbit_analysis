/**
 * 서버가 뜰 때 한 번:
 * - 운영 관리자가 없으면 환경 변수(OPERATOR_INIT_*)로 첫 관리자 생성 (12.1)
 * - 지금 배포 버전 기록 (APP_VERSION, DEPLOYED_BY, DEPLOY_SUMMARY) (12.3)
 * - 예약 작업(pg-boss) 시작
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { smsTestMode } = await import("@/lib/auth/sms-rules");
  if (smsTestMode() && process.env.NODE_ENV === "production") {
    console.warn(
      "[sms] 테스트 모드: 실제 문자를 보내지 않고 인증번호가 000000으로 고정됩니다. 운영 배포 전 SMS_PROVIDER를 실제 대행사로 바꾸세요",
    );
  }
  if (process.env.DATABASE_URL) {
    try {
      const { getDb } = await import("@/lib/db");
      const { bootstrapFirstOperator } =
        await import("@/server/admin/operator-auth");
      const r = await bootstrapFirstOperator(getDb());
      if (r === "created")
        console.info("[admin] 첫 운영 관리자를 만들었습니다");
      if (process.env.APP_VERSION) {
        const { registerCurrentVersion } =
          await import("@/server/admin/version-service");
        await registerCurrentVersion(getDb(), {
          version: process.env.APP_VERSION,
          deployedBy: process.env.DEPLOYED_BY,
          summary: process.env.DEPLOY_SUMMARY,
        });
      }
    } catch (e) {
      // 값은 남기지 않고 원인만 남긴다
      console.error(
        "[admin] 시작 준비 실패:",
        e instanceof Error ? e.message : "알 수 없는 오류",
      );
    }
  }
  if (process.env.JOBS_ENABLED !== "1") return;
  const { startJobs } = await import("@/server/jobs/boss");
  await startJobs();
}
