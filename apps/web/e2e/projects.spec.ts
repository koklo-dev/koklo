import { expect, test } from "@playwright/test";
import {
  CAPTURES_DIR,
  type ProjectsState,
  releaseHeld,
  setScenario,
  switchToDark,
  type Theme,
} from "./support/helpers.ts";

const STATES: Array<{
  state: ProjectsState;
  projects: Parameters<typeof setScenario>[0]["projects"];
  testId: string;
}> = [
  { state: "loading", projects: "loading", testId: "projects-loading" },
  { state: "empty", projects: "empty", testId: "projects-empty" },
  { state: "data", projects: "data", testId: "projects-table" },
  { state: "error", projects: "internal", testId: "projects-error" },
];

for (const theme of ["light", "dark"] as Theme[]) {
  for (const { state, projects, testId } of STATES) {
    test(`S-projects ${state} (${theme}) : état visible et capture`, async ({ page }) => {
      await setScenario({ session: true, projects });
      await page.goto("/projects");
      if (theme === "dark") await switchToDark(page);
      await expect(page.getByTestId(testId)).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: "Projets" })).toBeVisible();
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^((?!dark).)*$/);
      await page.screenshot({
        path: `${CAPTURES_DIR}/S-projects/${state}-${theme}.png`,
        fullPage: true,
      });
      await releaseHeld();
    });
  }
}

test("S-projects : le gabarit expose la navigation, le titre et aucun panneau de détail", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data" });
  await page.goto("/projects");
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(nav.getByRole("link", { name: "Projets" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("app-shell")).toBeVisible();
  await expect(page.getByRole("complementary")).toHaveCount(0);
  await expect(page.getByRole("row")).toHaveCount(4);
});

test("S-projects erreur : « Réessayer » relance la requête et affiche les données", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "internal" });
  await page.goto("/projects");
  await expect(page.getByTestId("projects-error")).toBeVisible();
  await setScenario({ session: true, projects: "data" });
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByTestId("projects-table")).toBeVisible();
});

test("S-projects : UNAUTHORIZED redirige vers /login", async ({ page }) => {
  await setScenario({ session: true, projects: "unauthorized" });
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login$/);
});

test("thème : le choix persiste après rechargement, sans flash (classe dark dès le premier rendu)", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data" });
  await page.goto("/projects");
  await switchToDark(page);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: "Passer au thème clair" })).toBeVisible();
});

test("thème : clair par défaut même si le système préfère le sombre", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await setScenario({ session: true, projects: "data" });
  await page.goto("/projects");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("mobile 375 px : pas de défilement horizontal, cibles de 44 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await setScenario({ session: true, projects: "data" });
  await page.goto("/projects");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  const box = await page.getByRole("button", { name: "Passer au thème sombre" }).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
});

test("mouvement réduit : le squelette ne pulse pas", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setScenario({ session: true, projects: "loading" });
  await page.goto("/projects");
  const animated = await page
    .getByTestId("projects-loading")
    .evaluate((root) =>
      [...root.querySelectorAll("*")].some((el) => getComputedStyle(el).animationName !== "none"),
    );
  expect(animated).toBe(false);
  await releaseHeld();
});
