import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** 한 달 운영 시뮬레이션 (npm run test:sim). DATABASE_URL_TEST DB를 비우고 쓴다. SIM_SEED·SIM_DAYS·SIM_REPORT로 조절 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./src/test/empty.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.sim.test.ts"],
    globalSetup: ["./src/test/db-global-setup.ts"],
    setupFiles: ["./src/test/db-setup.ts"],
    fileParallelism: false,
    testTimeout: 3_600_000,
    hookTimeout: 120_000,
    env: { TZ: "America/Los_Angeles", SMS_FIXED_CODE: "0" },
  },
});
