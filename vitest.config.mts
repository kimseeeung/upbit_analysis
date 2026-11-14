import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.db.test.ts", "src/**/*.sim.test.ts", "node_modules/**"],
    // 서버 TZ와 관계없이 한국 시간 계산이 맞는지 보려고 일부러 UTC가 아닌 값을 쓴다.
    env: { TZ: "America/Los_Angeles", SMS_FIXED_CODE: "0" },
  },
});
