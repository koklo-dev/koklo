import { expect, test } from "@playwright/test";
import { CAPTURES_DIR, setScenario, settle, switchToDark, type Theme } from "./support/helpers.ts";

type Shot = {
  screen: "S-organizations" | "S-members" | "S-projects";
  state: string;
  path: string;
  scenario: Parameters<typeof setScenario>[0];
  ready: (page: import("@playwright/test").Page) => Promise<void>;
};

const SHOTS: Shot[] = [
  {
    screen: "S-organizations",
    state: "create",
    path: "/organizations",
    scenario: { session: true, projects: "data", organizations: "none", activeOrganization: false },
    ready: async (page) => {
      await expect(page.getByTestId("organizations-page")).toBeVisible();
      await expect(page.getByLabel("Nom de l'organisation")).toBeVisible();
    },
  },
  {
    screen: "S-organizations",
    state: "choose",
    path: "/organizations",
    scenario: { session: true, projects: "data", organizations: "many", activeOrganization: false },
    ready: async (page) => {
      await expect(page.getByTestId("organizations-page")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Ouvrir l'organisation Atelier Lumière" }),
      ).toBeVisible();
    },
  },
  {
    screen: "S-organizations",
    state: "choose-active",
    path: "/organizations",
    scenario: { session: true, projects: "data", organizations: "many", activeOrganization: true },
    ready: async (page) => {
      await expect(page.getByTestId("organizations-page")).toBeVisible();
      await expect(page.getByRole("link", { name: "Retour aux projets" })).toBeVisible();
      await expect(page.getByText("Active")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Ouvrir l'organisation Studio Nord" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Ouvrir l'organisation Atelier Lumière" }),
      ).toHaveCount(0);
    },
  },
  {
    screen: "S-members",
    state: "data",
    path: "/members",
    scenario: { session: true, projects: "data" },
    ready: async (page) => {
      await expect(page.getByTestId("members-page")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: "Membres" })).toBeVisible();
      await expect(page.getByText("Awa Koné")).toBeVisible();
    },
  },
  {
    screen: "S-projects",
    state: "create-sheet",
    path: "/projects",
    scenario: { session: true, projects: "data" },
    ready: async (page) => {
      await page.getByTestId("create-project-button").click();
      await expect(page.getByTestId("create-project-sheet")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Créer un projet" })).toBeVisible();
    },
  },
];

for (const theme of ["light", "dark"] as Theme[]) {
  for (const { screen, state, path, scenario, ready } of SHOTS) {
    test(`${screen} ${state} (${theme}) : état visible et capture`, async ({ page }) => {
      await setScenario(scenario);
      await page.goto(path);
      // La bascule de thème passe par le menu utilisateur : avant d'ouvrir le panneau.
      if (theme === "dark") await switchToDark(page);
      await ready(page);
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^((?!dark).)*$/);
      await settle(page);
      await page.screenshot({
        path: `${CAPTURES_DIR}/${screen}/${state}-${theme}.png`,
        fullPage: true,
      });
    });
  }
}
