import { sharedVitestConfig } from "@koklo/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      // Les tests d'intégration démarrent un vrai PostgreSQL (image tirée au premier lancement).
      testTimeout: 60_000,
      hookTimeout: 180_000,
      coverage: { exclude: ["src/**/*.test.ts", "src/main.ts"] },
    },
  }),
);
