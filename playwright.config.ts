import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const E2E_DB = process.env.DATABASE_URL_E2E;
if (!E2E_DB) {
  throw new Error("DATABASE_URL_E2E가 없습니다 (.env.example 참고)");
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npx prisma migrate deploy && npx prisma db seed && npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      DATABASE_URL: E2E_DB,
      SMS_PROVIDER: "console",
      SMS_DEV_OUTBOX: "1",
      COOKIE_INSECURE: "1",
      CRON_SECRET: "e2e-cron-secret",
      APP_BASE_URL: `http://localhost:${PORT}`,
    },
  },
});
