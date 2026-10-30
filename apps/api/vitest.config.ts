import { sharedVitestConfig } from "@koklo/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

/**
 * Les tests d'intégration démarrent un Postgres éphémère : délais plus larges que le défaut.
 * `main.ts` et `cli/import-sprints.main.ts` (amorçage du serveur réseau et du script) sont hors couverture : tout ce qu'il appelle est testé.
 */
export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      testTimeout: 120_000,
      hookTimeout: 120_000,
      coverage: { exclude: ["src/**/*.test.ts", "src/main.ts", "src/cli/import-sprints.main.ts"] },
    },
  }),
);
