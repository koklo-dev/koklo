import { expect, test } from "@playwright/test";
import { CAPTURES_DIR, setScenario, settle, switchToDark, type Theme } from "./support/helpers.ts";

const PATH = "/accept-invitation/01900000-0000-7000-8000-0000000000d1";

const STATES = [
  { state: "ready", invitation: "ready", title: /^Rejoindre Atelier Lumière$/ },
  { state: "member", invitation: "member", title: /déjà partie/ },
  { state: "wrong", invitation: "wrong", title: /autre adresse/ },
  { state: "invalid", invitation: "invalid", title: /n'est plus valide/ },
] as const;

for (const theme of ["light", "dark"] as Theme[]) {
  for (const { state, invitation, title } of STATES) {
    test(`S-accept-invitation ${state} (${theme}) : état visible et capture`, async ({ page }) => {
      await setScenario({ session: true, projects: "data", activeOrganization: false, invitation });
      await page.goto(PATH);
      if (theme === "dark") await switchToDark(page);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await settle(page);
      await page.screenshot({
        path: `${CAPTURES_DIR}/S-accept-invitation/${state}-${theme}.png`,
        fullPage: true,
      });
    });
  }
}
