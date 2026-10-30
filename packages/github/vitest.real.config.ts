import { defineConfig } from "vitest/config";

/** Config manuelle (`pnpm --filter @koklo/github test:real`) : jamais utilisée par la CI. */
export default defineConfig({
  test: {
    include: ["test/real/**/*.real.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
