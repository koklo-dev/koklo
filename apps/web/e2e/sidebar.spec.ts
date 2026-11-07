import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  AXE_TAGS,
  collapseOf,
  hydrated,
  menuOf,
  setScenario,
  sidebarOf,
  switchToDark,
} from "./support/helpers.ts";
import { FEATURE_PROJECT_ID } from "./support/stub-features.ts";

const PROJECT = `/projects/${FEATURE_PROJECT_ID}`;
const SPEC = `${PROJECT}/spec/functional`;

test.beforeEach(async () => {
  await setScenario({ session: true, projects: "data" });
});

test("barre : « Replier la barre » replie à 64 px et rouvre, l'état survit au rechargement (clavier)", async ({
  page,
}) => {
  await page.goto(SPEC);
  await expect(sidebarOf(page)).toHaveAttribute("data-state", "expanded");
  expect((await sidebarOf(page).boundingBox())?.width).toBe(256);
  await collapseOf(page).focus();
  await page.keyboard.press("Enter");
  await expect(sidebarOf(page)).toHaveAttribute("data-state", "collapsed");
  // La largeur se transitionne en 150 ms : on attend qu'elle se stabilise.
  await expect.poll(async () => (await sidebarOf(page).boundingBox())?.width).toBe(64);
  // Replié : chaque icône garde son nom accessible.
  await expect(sidebarOf(page).getByRole("link", { name: "Spec · Fonctionnel" })).toBeVisible();
  await expect(sidebarOf(page).getByRole("link", { name: "Tickets" })).toBeVisible();
  await page.reload();
  await expect(sidebarOf(page)).toHaveAttribute("data-state", "collapsed");
  expect(await page.evaluate(() => document.cookie)).not.toContain("sidebar");
});

test("barre : Ctrl+B replie, la barre reste collante sur toute la hauteur", async ({ page }) => {
  await page.goto(SPEC);
  await hydrated(page);
  await page.keyboard.press("Control+b");
  await expect(sidebarOf(page)).toHaveAttribute("data-state", "collapsed");
  await page.keyboard.press("Control+b");
  await expect(sidebarOf(page)).toHaveAttribute("data-state", "expanded");
  const box = await sidebarOf(page).boundingBox();
  const viewport = page.viewportSize();
  expect(box?.height).toBe(viewport?.height);
  expect(box?.y).toBe(0);
});

test("barre : groupes Projet, SPEC (sept entrées numérotées, 0/7) et Organisation, sans Kanban ni Membres", async ({
  page,
}) => {
  await page.goto(SPEC);
  const bar = sidebarOf(page);
  await expect(bar.getByRole("link", { name: "Fonctionnel" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const spec = bar.getByRole("group", { name: "Spec" });
  await expect(spec).toContainText("0/7");
  await expect(spec.getByRole("listitem")).toHaveCount(7);
  await expect(bar.getByRole("link", { name: "Données" })).toHaveAttribute(
    "href",
    `${PROJECT}/spec/data`,
  );
  const locked = bar.getByRole("button", { name: "Architecture, disponible après les données" });
  await expect(locked).toHaveAttribute("aria-disabled", "true");
  await locked.focus();
  await expect(page.getByRole("tooltip").first()).toContainText("Disponible après les données");
  for (const name of ["Kanban", "Membres", "GitHub", "IA", "Projets"]) {
    await expect(bar.getByRole("link", { name, exact: true })).toHaveCount(0);
  }
  await expect(bar.getByRole("link", { name: "Tous les projets" })).toHaveAttribute(
    "href",
    "/projects",
  );
  await expect(bar.getByRole("link", { name: "Réglages" })).toHaveAttribute(
    "href",
    "/settings/members",
  );
});

test("barre : Tickets porte le compteur du sprint actif, absent sans sprint actif", async ({
  page,
}) => {
  await page.goto(SPEC);
  await expect(sidebarOf(page).getByRole("link", { name: /^Tickets/ })).toContainText("8");
  await setScenario({ session: true, projects: "data", shell: "noSprint" });
  await page.goto(SPEC);
  await expect(sidebarOf(page).getByRole("link", { name: "Tickets" })).toHaveText("Tickets");
});

test("barre : project.visit est appelé à l'ouverture du projet et nourrit la carte projet", async ({
  page,
}) => {
  await page.goto(SPEC);
  await expect(
    sidebarOf(page)
      .getByRole("button", { name: /Atelier Lumière/ })
      .first(),
  ).toBeVisible();
  // En développement, React rejoue les effets une fois de plus : le faux API peut voir deux visites du même projet.
  await expect
    .poll(async () => [
      ...new Set((await (await fetch("http://127.0.0.1:3101/__visits")).json()) as string[]),
    ])
    .toEqual([FEATURE_PROJECT_ID]);
  await sidebarOf(page).getByRole("button", { name: /Phase/ }).click();
  await expect(page.getByRole("menuitem", { name: "Atelier Lumière" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Tous les projets" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Créer un projet" })).toBeVisible();
});

test("barre : le menu utilisateur propose « Se déconnecter », focus visible", async ({ page }) => {
  await page.goto("/projects");
  const link = sidebarOf(page).getByRole("link", { name: "Tous les projets" });
  await link.focus();
  await expect(link).toBeFocused();
  await sidebarOf(page)
    .getByRole("button", { name: /Menu utilisateur/ })
    .click();
  await expect(page.getByRole("menuitem", { name: "Se déconnecter" })).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  for (const path of ["/projects", SPEC]) {
    test(`barre : axe WCAG AA sans violation sur ${path.replace(FEATURE_PROJECT_ID, "<id>")}, étendue et repliée (${theme})`, async ({
      page,
    }) => {
      await page.goto(path);
      if (theme === "dark") await switchToDark(page);
      await expect(sidebarOf(page)).toHaveAttribute("data-state", "expanded");
      const scan = () => new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect((await scan()).violations).toEqual([]);
      await collapseOf(page).click();
      await expect(sidebarOf(page)).toHaveAttribute("data-state", "collapsed");
      // Pas de mesure de contraste en pleine transition de largeur.
      await page.evaluate(() =>
        Promise.allSettled(document.getAnimations().map((a) => a.finished)),
      );
      expect((await scan()).violations).toEqual([]);
    });
  }
}

test("mobile 375 px : tiroir ouvert au clavier, Échap ferme et rend le focus, aucun défilement horizontal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(SPEC);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const menu = menuOf(page);
  const box = await menu.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await menu.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Tickets" }).first()).toBeVisible();
  for (const theme of ["light"] as const) {
    expect(theme).toBe("light");
    expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(menu).toBeFocused();
});
