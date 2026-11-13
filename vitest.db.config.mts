import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** 실제 PostgreSQL을 쓰는 통합 테스트. DATABASE_URL_TEST가 가리키는 DB를 비우고 쓴다. */
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
    include: ["src/**/*.db.test.ts"],
    globalSetup: ["./src/test/db-global-setup.ts"],
    setupFiles: ["./src/test/db-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: { TZ: "America/Los_Angeles" },
  },
});
