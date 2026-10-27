import { sharedVitestConfig } from "@koklo/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

/** Client généré et outillage de test ne sont pas du code métier : hors périmètre de couverture. */
export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: { coverage: { exclude: ["src/**/*.test.ts", "src/generated/**", "src/testing/**"] } },
  }),
);
