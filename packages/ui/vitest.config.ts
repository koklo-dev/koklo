import { sharedVitestConfig } from "@koklo/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
      setupFiles: ["./test/setup.ts"],
      coverage: {
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/icons/generated/**", "src/**/*.test.{ts,tsx}"],
      },
    },
  }),
);
