import { sharedVitestConfig } from "@koklo/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

/** CDC §19.2 : 90 % des branches pour packages/domain (lignes inchangées à 80 %). */
export const domainCoverageThresholds = { lines: 80, branches: 90 } as const;

export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: { coverage: { thresholds: domainCoverageThresholds } },
  }),
);
