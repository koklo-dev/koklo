import { sharedVitestConfig } from "@koklo/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

/**
 * Config de la CI : collecte uniquement `*.test.ts`. Les fichiers `*.real.ts` (GitHub réel,
 * manuels) ne le sont jamais ici : voir `vitest.real.config.ts`. L'outillage de test publié
 * (`src/testing/**`) est exclu de la couverture, comme dans `@koklo/db`.
 */
export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      coverage: {
        exclude: ["src/**/*.test.ts", "src/testing/**"],
        thresholds: { lines: 80, branches: 70 },
      },
    },
  }),
);
