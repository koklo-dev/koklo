import { sharedVitestConfig } from "@koklo/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

/** Seuils du CDC §19.2 : lignes 80 %, branches 70 %. Le paquet est pur : tout `src/` est mesuré. */
export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      coverage: {
        exclude: ["src/**/*.test.ts"],
        thresholds: { lines: 80, branches: 70 },
      },
    },
  }),
);
