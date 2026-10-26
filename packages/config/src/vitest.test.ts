import { describe, expect, it } from "vitest";
import { coverageThresholds, sharedVitestConfig } from "./vitest.ts";

describe("sharedVitestConfig", () => {
  it("applique les seuils de couverture du CDC §19.2", () => {
    expect(coverageThresholds).toEqual({ lines: 80, branches: 70 });
    expect(sharedVitestConfig.test?.coverage?.thresholds).toEqual(coverageThresholds);
  });

  it("produit le coverage-summary.json attendu par la CI", () => {
    expect(sharedVitestConfig.test?.coverage?.reporter).toContain("json-summary");
  });
});
