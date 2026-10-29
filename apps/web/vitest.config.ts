import { sharedVitestConfig } from "@koklo/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
      setupFiles: ["./test/setup.ts"],
      // Les tests de composants rendent de vrais écrans sous couverture v8 : sur un runner partagé,
      // certains dépassent les 5 s par défaut sans qu'aucune assertion ne soit en cause.
      testTimeout: 20_000,
      coverage: {
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/**/*.test.{ts,tsx}"],
      },
    },
  }),
);
