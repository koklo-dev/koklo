import { expect, test } from "@playwright/test";
import {
  CAPTURES_DIR,
  type KanbanRole,
  setScenario,
  settle,
  switchToDark,
} from "./support/helpers.ts";

/**
 * Rattrapage des captures de S-settings (décision B130) : chaque section visible par un rôle, en clair, en sombre et
 * à 375 px, dans design/screens/captures/S-settings/<section>-<rôle>-<light|dark|mobile>.png.
 */
const SHOTS: Array<[section: string, role: KanbanRole]> = [
  ["general", "owner"],
  ["members", "owner"],
  ["members", "dev"],
  ["account", "owner"],
  ["account", "dev"],
  ["account", "client"],
];
const VARIANTS = [
  { suffix: "light", dark: false, width: 1280 },
  { suffix: "dark", dark: true, width: 1280 },
  { suffix: "mobile", dark: false, width: 375 },
] as const;

for (const [section, role] of SHOTS) {
  for (const { suffix, dark, width } of VARIANTS) {
    test(`capture S-settings ${section}-${role}-${suffix}`, async ({ page }) => {
      await setScenario({
        session: true,
        projects: "data",
        role,
        providers: { list: "empty" },
        installations: "data",
        ...(section === "members" ? { members: "many" as const } : {}),
      });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/settings/${section}`);
      await expect(page.getByRole("heading", { level: 1, name: "Réglages" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
      if (dark) await switchToDark(page);
      await page.waitForLoadState("networkidle");
      await settle(page);
      await page.screenshot({
        path: `${CAPTURES_DIR}/S-settings/${section}-${role}-${suffix}.png`,
        fullPage: true,
      });
    });
  }
}
