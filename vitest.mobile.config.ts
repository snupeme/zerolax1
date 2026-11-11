import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "apps/api/scripts/telegram-privacy.test.ts",
      "apps/api/scripts/mobile-smoke.test.ts",
      "apps/api/scripts/study-navigation.test.ts",
      "apps/api/scripts/games.test.ts",
    ],
    environment: "node",
    fileParallelism: false,
  },
});
