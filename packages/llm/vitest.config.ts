import { sharedVitestConfig } from "@koklo/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

/**
 * CDC §19.2 : branches 90 %, lignes 80 %. L'outillage publié (`src/testing/**`) est exclu de la
 * couverture. `vitest.setup.ts` remplace `globalThis.fetch` : aucun appel réseau n'est possible en CI.
 */
export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      setupFiles: ["./vitest.setup.ts"],
      coverage: {
        exclude: ["src/**/*.test.ts", "src/testing/**"],
        thresholds: { lines: 80, branches: 90 },
      },
    },
  }),
);
