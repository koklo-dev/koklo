import { expect, type Page, test } from "@playwright/test";
import {
  CAPTURES_DIR,
  type KanbanBoard,
  releaseHeld,
  setScenario,
  settle,
  sidebarOf,
  switchToDark,
  type Theme,
  transitionsSeen,
} from "./support/helpers.ts";

const column = (page: Page, status: string) => page.getByTestId(`kanban-column-${status}`);
/** Le message du tableau : exclut l'annonceur de route de Next, qui a aussi le rôle alert (et est vide). */
const alertOf = (page: Page) => page.getByRole("alert").filter({ hasText: /\S/ });
const card = (page: Page, key: string) => page.getByTestId(`kanban-card-${key}`);

type Scenario = Parameters<typeof setScenario>[0];
const open = async (page: Page, scenario: Partial<Scenario> = {}) => {
  await setScenario({ session: true, projects: "data", board: "data", ...scenario });
  await page.goto("/kanban");
};

/** Atteint un contrôle uniquement avec la touche Tab (ordre de focus réel). */
async function tabTo(page: Page, name: string): Promise<void> {
  const target = page.getByRole("button", { name });
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`« ${name} » inatteignable au clavier`);
}

test.describe("E1 — glisser une carte vers une colonne valide", () => {
  test("TK-102 « À faire » vers « En cours » : requête avec le bon statut, carte déplacée", async ({
    page,
  }) => {
    await open(page, { transition: "ok" });
    await expect(column(page, "todo").getByTestId("kanban-card-TK-102")).toBeVisible();
    await card(page, "TK-102").dragTo(column(page, "in_progress"));
    await expect(column(page, "in_progress").getByTestId("kanban-card-TK-102")).toBeVisible();
    await expect(column(page, "todo").getByTestId("kanban-card-TK-102")).toHaveCount(0);
    await expect(page.getByText("TK-102 déplacé vers En cours.")).toBeVisible();
    expect(await transitionsSeen()).toEqual([{ key: "TK-102", to: "in_progress" }]);
  });

  test("déposer sur la colonne d'origine n'envoie aucune requête", async ({ page }) => {
    await open(page);
    await card(page, "TK-102").dragTo(column(page, "todo"));
    await expect(card(page, "TK-102")).toBeVisible();
    expect(await transitionsSeen()).toEqual([]);
  });
});

test.describe("E2 — une transition interdite est refusée et affichée", () => {
  test("TK-102 « À faire » vers « Terminé » : 409, message départ/arrivée, carte en place", async ({
    page,
  }) => {
    // Fenêtre assez large pour voir les 7 colonnes : Playwright fait défiler la cible avant de glisser, ce qui
    // changerait la carte saisie (correction du test en Green, voir 04-green.md).
    await page.setViewportSize({ width: 2400, height: 900 });
    await open(page, { transition: "invalid" });
    await card(page, "TK-102").dragTo(column(page, "done"));
    const alert = alertOf(page);
    await expect(alert).toContainText("Déplacement impossible");
    await expect(alert).toContainText(
      "Transition interdite : TK-102 ne peut pas passer de « À faire » à « Terminé ».",
    );
    await expect(column(page, "todo").getByTestId("kanban-card-TK-102")).toBeVisible();
    await expect(column(page, "done").getByTestId("kanban-card-TK-102")).toHaveCount(0);
    expect(await transitionsSeen()).toEqual([{ key: "TK-102", to: "done" }]);
  });

  test("le message se ferme et l'état se restaure (la carte reste déplaçable)", async ({
    page,
  }) => {
    // Fenêtre assez large pour voir les 7 colonnes : Playwright fait défiler la cible avant de glisser, ce qui
    // changerait la carte saisie (correction du test en Green, voir 04-green.md).
    await page.setViewportSize({ width: 2400, height: 900 });
    await open(page, { transition: "invalid" });
    await card(page, "TK-102").dragTo(column(page, "done"));
    await page.getByRole("button", { name: "Fermer le message" }).click();
    await expect(alertOf(page)).toHaveCount(0);
    await expect(card(page, "TK-102")).not.toHaveAttribute("aria-busy", "true");
  });

  test("FORBIDDEN serveur : message de droits", async ({ page }) => {
    await open(page, { transition: "forbidden" });
    await card(page, "TK-102").dragTo(column(page, "in_progress"));
    await expect(alertOf(page)).toContainText("Vous n'avez pas le droit de déplacer les tickets.");
  });

  test("INTERNAL : « Le déplacement a échoué » avec « Réessayer »", async ({ page }) => {
    await open(page, { transition: "internal" });
    await card(page, "TK-102").dragTo(column(page, "in_progress"));
    const alert = alertOf(page);
    await expect(alert).toContainText("Le déplacement a échoué");
    await expect(alert.getByRole("button", { name: "Réessayer" })).toBeVisible();
  });
});

test.describe("E3 — les mêmes déplacements au clavier", () => {
  test("Tab jusqu'à « Déplacer TK-102 », Entrée, choix « En cours » : déplacé", async ({
    page,
  }) => {
    await open(page, { transition: "ok" });
    await expect(card(page, "TK-102")).toBeVisible();
    await tabTo(page, "Déplacer TK-102");
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Déplacer TK-102 vers" });
    await expect(menu.getByRole("menuitem")).toHaveCount(6);
    await page.getByRole("menuitem", { name: "En cours" }).focus();
    await page.keyboard.press("Enter");
    await expect(column(page, "in_progress").getByTestId("kanban-card-TK-102")).toBeVisible();
    await expect(page.getByText("TK-102 déplacé vers En cours.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Déplacer TK-102" })).toBeFocused();
    expect(await transitionsSeen()).toEqual([{ key: "TK-102", to: "in_progress" }]);
  });

  test("transition interdite au clavier : refus affiché, focus rendu au bouton", async ({
    page,
  }) => {
    await open(page, { transition: "invalid" });
    await tabTo(page, "Déplacer TK-102");
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: "Terminé" }).focus();
    await page.keyboard.press("Enter");
    await expect(alertOf(page)).toContainText(
      "Transition interdite : TK-102 ne peut pas passer de « À faire » à « Terminé ».",
    );
    await expect(column(page, "todo").getByTestId("kanban-card-TK-102")).toBeVisible();
    await expect(page.getByRole("button", { name: "Déplacer TK-102" })).toBeFocused();
  });

  test("Échap ferme le menu et rend le focus au bouton", async ({ page }) => {
    await open(page);
    await tabTo(page, "Déplacer TK-102");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Déplacer TK-102" })).toBeFocused();
  });
});

test.describe("E4 — rôles client et business en lecture seule", () => {
  for (const role of ["client", "business"] as const) {
    test(`${role} : ni « Déplacer » ni carte glissable, mention de lecture seule`, async ({
      page,
    }) => {
      await open(page, { role });
      await expect(card(page, "TK-102")).toBeVisible();
      await expect(
        page.getByText("Lecture seule : votre rôle ne permet pas de déplacer les tickets."),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: /Déplacer/ })).toHaveCount(0);
      await expect(card(page, "TK-102")).not.toHaveAttribute("draggable", "true");
    });
  }

  test("un glissé tenté par un client n'envoie aucune requête", async ({ page }) => {
    await open(page, { role: "client" });
    await card(page, "TK-102").dragTo(column(page, "in_progress"));
    await expect(column(page, "todo").getByTestId("kanban-card-TK-102")).toBeVisible();
    expect(await transitionsSeen()).toEqual([]);
  });

  test("designer : contrôles de déplacement présents", async ({ page }) => {
    await open(page, { role: "designer" });
    await expect(page.getByRole("button", { name: "Déplacer TK-102" })).toBeVisible();
  });
});

const STATES: Array<{ state: string; board: KanbanBoard; testId: string }> = [
  { state: "loading", board: "loading", testId: "kanban-loading" },
  { state: "no-sprint", board: "noSprint", testId: "kanban-no-sprint" },
  { state: "no-project", board: "noProject", testId: "kanban-no-project" },
  { state: "empty", board: "empty", testId: "kanban-board" },
  { state: "data", board: "data", testId: "kanban-board" },
  { state: "error", board: "internal", testId: "kanban-error" },
];

for (const theme of ["light", "dark"] as Theme[]) {
  for (const { state, board, testId } of STATES) {
    test(`E5 S-kanban ${state} (${theme}) : état visible et capture`, async ({ page }) => {
      await open(page, { board });
      if (theme === "dark") await switchToDark(page);
      await expect(page.getByTestId(testId)).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: "Kanban" })).toBeVisible();
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^((?!dark).)*$/);
      await settle(page);
      await page.screenshot({
        path: `${CAPTURES_DIR}/S-kanban/${state}-${theme}.png`,
        fullPage: true,
      });
      await releaseHeld();
    });
  }
}

test("E5 : 7 colonnes dans l'ordre, cartes triées, défilement dans la région du tableau", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Backlog",
    "À faire",
    "En cours",
    "En revue",
    "Bloqué",
    "Terminé",
    "Annulé",
  ]);
  await expect(sidebarOf(page).getByRole("link", { name: "Kanban" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await expect(page.getByRole("region", { name: "Colonnes du kanban" })).toHaveAttribute(
    "tabindex",
    "0",
  );
});

test("E5 erreur : « Réessayer » relance et affiche le tableau", async ({ page }) => {
  await open(page, { board: "internal" });
  await expect(page.getByTestId("kanban-error")).toBeVisible();
  await setScenario({ session: true, projects: "data", board: "data" });
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByTestId("kanban-board")).toBeVisible();
});

test("E5 : UNAUTHORIZED redirige vers /login", async ({ page }) => {
  await open(page, { board: "unauthorized" });
  await expect(page).toHaveURL(/\/login/);
});

test("E5 mobile 375 px : pas de défilement horizontal de la page, cible « Déplacer » de 44 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page);
  await expect(card(page, "TK-102")).toBeAttached();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  const box = await page.getByRole("button", { name: "Déplacer TK-102" }).boundingBox();
  expect(Math.min(box?.height ?? 0, box?.width ?? 0)).toBeGreaterThanOrEqual(44);
});

test("E5 mouvement réduit : le squelette ne pulse pas", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, { board: "loading" });
  const animated = await page
    .getByTestId("kanban-loading")
    .evaluate((root) =>
      [...root.querySelectorAll("*")].some((el) => getComputedStyle(el).animationName !== "none"),
    );
  expect(animated).toBe(false);
  await releaseHeld();
});
