import { expect, test } from "@playwright/test";
import { setScenario } from "./support/helpers.ts";
import { FEATURE_PROJECT_ID } from "./support/stub-features.ts";

/** TK-88 : routes de la coquille, redirections des anciens chemins (proxy, 307) et pages serveur `/` et `/kanban`. */
const PROJECT = `/projects/${FEATURE_PROJECT_ID}`;

test.beforeEach(async () => {
  await setScenario({ session: true, projects: "data", installations: "data" });
});

test("anciens chemins : /members, /github (requête conservée) et /projects/<id>/features", async ({
  page,
}) => {
  await page.goto("/members");
  await expect(page).toHaveURL(/\/settings\/members$/);
  await expect(page.getByRole("heading", { level: 1, name: "Réglages" })).toBeVisible();
  await page.goto(`${PROJECT}/features?q=kanban&sel=F-002`);
  await expect(page).toHaveURL(
    new RegExp(`${PROJECT}/spec/functional\\?tab=features&q=kanban&sel=F-002$`),
  );
  // Retour de GitHub : le résultat est lu puis l'adresse est nettoyée sur /settings/github.
  await page.goto("/github?result=installed");
  await expect(page.getByText("Application GitHub installée")).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/github$/);
});

test("sans session, un ancien chemin renvoie vers /login (la garde passe avant la redirection)", async ({
  page,
}) => {
  await setScenario({ session: false, projects: "data" });
  for (const path of ["/members", "/github?result=installed", `${PROJECT}/features`]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login/);
  }
});

test("/projects/<id> ouvre le cahier fonctionnel ; /settings ouvre Membres ; section inconnue : 404", async ({
  page,
}) => {
  await page.goto(PROJECT);
  await expect(page).toHaveURL(new RegExp(`${PROJECT}/spec/functional\\?tab=features$`));
  await expect(page.getByRole("heading", { level: 1, name: "Cahier fonctionnel" })).toBeVisible();
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings\/members$/);
  expect((await page.goto("/settings/inconnue"))?.status()).toBe(404);
  expect((await page.goto(`${PROJECT}/spec/inconnu`))?.status()).toBe(404);
});

test("/ et /kanban ouvrent le dernier projet ouvert, sinon la liste des projets", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/projects$/);
  await page.goto("/kanban");
  await expect(page).toHaveURL(/\/projects$/);
  await page.goto(`${PROJECT}/spec/functional`);
  await expect
    .poll(async () => (await fetch("http://127.0.0.1:3101/__visits")).json())
    .toContain(FEATURE_PROJECT_ID);
  await page.goto("/");
  await expect(page).toHaveURL(new RegExp(`${PROJECT}/spec/functional\\?tab=features$`));
  await page.goto("/kanban");
  await expect(page).toHaveURL(new RegExp(`${PROJECT}/tickets$`));
  await expect(page.getByRole("heading", { level: 1, name: "Tickets" })).toBeVisible();
});

test("pages « Bientôt » : Idée et un livrable, EmptyState sans action, onglet du cahier", async ({
  page,
}) => {
  await page.goto(`${PROJECT}/idea`);
  await expect(page.getByRole("heading", { level: 1, name: "Idée" })).toBeVisible();
  await expect(page.getByText("L'espace Idée arrive dans une prochaine version.")).toBeVisible();
  await page.goto(`${PROJECT}/spec/data`);
  await expect(page.getByRole("heading", { level: 1, name: "Données" })).toBeVisible();
  await expect(page.getByText("Bientôt")).toBeVisible();
  await expect(page.locator("main").getByRole("button")).toHaveCount(0);
  await page.goto(`${PROJECT}/spec/functional?tab=rules`);
  await expect(
    page.getByText("Les règles métier arrivent dans une prochaine version."),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Onglets du cahier fonctionnel" })
      .getByRole("link", { name: "Règles métier" }),
  ).toHaveAttribute("aria-current", "page");
  // Un `tab` inconnu ouvre les fonctionnalités.
  await page.goto(`${PROJECT}/spec/functional?tab=inconnu`);
  await expect(page.getByRole("list", { name: "Fonctionnalités" })).toBeVisible();
});

test("un client lié garde la coquille sans Réglages ni Assistant de cadrage", async ({ page }) => {
  await setScenario({ session: true, projects: "data", role: "client" });
  await page.goto(`${PROJECT}/tickets`);
  const bar = page.locator('[data-slot="app-shell-sidebar"]');
  await expect(bar.getByRole("link", { name: /^Tickets/ })).toBeVisible();
  await expect(bar.getByRole("link", { name: "Réglages" })).toHaveCount(0);
  await expect(bar.getByRole("link", { name: "Assistant de cadrage" })).toHaveCount(0);
});
