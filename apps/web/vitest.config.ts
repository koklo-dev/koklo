import { sharedVitestConfig } from "@koklo/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
      setupFiles: ["./test/setup.ts"],
      coverage: {
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/**/*.test.{ts,tsx}"],
      },
    },
  }),
);
