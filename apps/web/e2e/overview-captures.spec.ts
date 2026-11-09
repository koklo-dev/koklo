import { expect, test } from "@playwright/test";
import { CAPTURES_DIR, hydrated, setScenario, settle, switchToDark } from "./support/helpers.ts";
import { OVERVIEW_PROJECT_ID, type OverviewMode } from "./support/stub-overview.ts";

/**
 * Captures de S-overview (TK-92) : chaque état, en clair, en sombre et à 375 px, dans
 * design/screens/captures/S-overview/<état>-<light|dark|mobile>.png.
 */
const STATES: OverviewMode[] = [
  "idea",
  "framing",
  "iterations",
  "new",
  "neutral",
  "noSprint",
  "client",
  "error",
];
const VARIANTS = [
  { suffix: "light", dark: false, width: 1280 },
  { suffix: "dark", dark: true, width: 1280 },
  { suffix: "mobile", dark: false, width: 375 },
] as const;

for (const state of STATES) {
  for (const { suffix, dark, width } of VARIANTS) {
    test(`capture S-overview ${state}-${suffix}`, async ({ page }) => {
      await setScenario({ session: true, projects: "data", overview: state });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/projects/${OVERVIEW_PROJECT_ID}`);
      await hydrated(page);
      if (dark) await switchToDark(page);
      await expect(page.getByRole("heading", { level: 1, name: "Vue d'ensemble" })).toBeVisible();
      await expect(page.getByTestId("overview-skeleton")).toHaveCount(0);
      await settle(page);
      await page.screenshot({
        path: `${CAPTURES_DIR}/S-overview/${state}-${suffix}.png`,
        fullPage: true,
      });
    });
  }
}
