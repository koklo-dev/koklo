import { defineConfig } from "vitest/config";

/** Seuils de couverture du CDC §19.2 : lignes ≥ 80 %, branches ≥ 70 %. */
export const coverageThresholds = { lines: 80, branches: 70 } as const;

/** Config Vitest partagée ; chaque paquet peut y greffer ses propres surcharges. */
export const sharedVitestConfig = defineConfig({
  test: {
    // Sous couverture v8 sur un runner partagé, les tests de composants dépassent parfois les 5 s par défaut
    // sans qu'aucune assertion ne soit en cause (le test qui expire change d'un run à l'autre).
    testTimeout: 20_000,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      thresholds: coverageThresholds,
    },
  },
});
