import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

export type ProjectsState = "loading" | "empty" | "data" | "error";
export type Theme = "light" | "dark";

const STUB = "http://127.0.0.1:3101";

/** Captures jointes à la PR : design/screens/captures/<écran>/<état>-<thème>.png */
export const CAPTURES_DIR = resolve(import.meta.dirname, "../../../../design/screens/captures");

export async function setScenario(scenario: {
  session: boolean;
  projects: "loading" | "empty" | "data" | "internal" | "unauthorized";
  organizations?: "none" | "one" | "many";
  activeOrganization?: boolean;
}): Promise<void> {
  await fetch(`${STUB}/__scenario`, { method: "POST", body: JSON.stringify(scenario) });
}

export async function releaseHeld(): Promise<void> {
  await fetch(`${STUB}/__release`, { method: "POST" });
}

/**
 * Le thème par défaut est clair ; le sombre s'obtient par la bascule, comme pour une vraie personne.
 * Sur /login la bascule est un bouton ; dans le gabarit (TK-85) elle vit dans le menu « Menu utilisateur ».
 */
export async function switchToDark(page: Page): Promise<void> {
  // Avant l'hydratation le clic est sans effet : on le rejoue jusqu'à ce que la classe `dark` soit posée.
  await expect(async () => {
    const userMenu = page.getByRole("button", { name: "Menu utilisateur" });
    if (await userMenu.count()) {
      await userMenu.first().click({ timeout: 2_000 });
      await page
        .getByRole("menuitem", { name: "Passer au thème sombre" })
        .click({ timeout: 2_000 });
    } else {
      await page
        .getByRole("button", { name: "Passer au thème sombre" })
        .first()
        .click({ timeout: 2_000 });
    }
    await expect(page.locator("html")).toHaveClass(/dark/, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** Barre latérale du gabarit (bloc sidebar-07) et son bouton de repli. */
export const sidebarOf = (page: Page) => page.locator('[data-slot="sidebar"]');
export const triggerOf = (page: Page) => page.locator('[data-sidebar="trigger"]');

/** Attend la fin des transitions CSS (bascule de thème) pour que la capture montre l'état final. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished),
    ),
  );
}
