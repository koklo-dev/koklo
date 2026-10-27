import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { releaseHeld, setScenario, switchToDark } from "./support/helpers.ts";

const PAGES = [
  { name: "login", path: "/login", session: false, projects: "data" },
  { name: "projects loading", path: "/projects", session: true, projects: "loading" },
  { name: "projects empty", path: "/projects", session: true, projects: "empty" },
  { name: "projects data", path: "/projects", session: true, projects: "data" },
  { name: "projects error", path: "/projects", session: true, projects: "internal" },
] as const;

for (const theme of ["light", "dark"] as const) {
  for (const { name, path, session, projects } of PAGES) {
    test(`axe WCAG AA sans violation : ${name} (${theme})`, async ({ page }) => {
      await setScenario({ session, projects });
      await page.goto(path);
      if (theme === "dark") await switchToDark(page);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
      await releaseHeld();
    });
  }
}
