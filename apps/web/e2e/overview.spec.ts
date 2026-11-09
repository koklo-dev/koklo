import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  AXE_TAGS,
  hydrated,
  releaseHeld,
  setScenario,
  settle,
  sidebarOf,
  switchToDark,
} from "./support/helpers.ts";
import { OVERVIEW_PROJECT_ID, type OverviewMode } from "./support/stub-overview.ts";

const PROJECT = `/projects/${OVERVIEW_PROJECT_ID}`;

/** TK-92 : S-overview (design/screens/S-overview.md), sur le faux API (`stub-overview.ts`). */
async function open(page: Page, overview: OverviewMode, width = 1280): Promise<void> {
  await setScenario({ session: true, projects: "data", overview });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(PROJECT);
  await hydrated(page);
}

const heading = (page: Page) => page.getByRole("heading", { level: 1, name: "Vue d'ensemble" });

test("Cadrage : fil, prochaine étape, indicateurs, sept livrables dont un seul lien, activité et personnes", async ({
  page,
}) => {
  await open(page, "framing");
  await expect(heading(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${PROJECT}$`));
  await expect(page.getByRole("region", { name: "Phases du projet" })).toContainText("Cadrage");
  await expect(page.getByRole("note", { name: "Prochaine étape" })).toContainText(
    "Le cahier fonctionnel attend la validation de Marie",
  );
  await expect(page.getByRole("region", { name: "Indicateurs" })).toContainText("0 sur 7");
  const grid = page.getByRole("region", { name: "Livrables du cadrage" });
  await expect(grid.getByRole("link")).toHaveCount(1);
  await expect(grid.getByText("Bientôt disponible")).toHaveCount(6);
  await expect(page.getByRole("region", { name: "Activité" })).toContainText(
    "Marie a validé F-001",
  );
  await expect(page.getByRole("region", { name: "Personnes" })).toContainText("Moussa Diallo");
});

test("barre : « Vue d'ensemble » est active sur /projects/<id> et nulle part ailleurs", async ({
  page,
}) => {
  await open(page, "framing");
  await expect(sidebarOf(page).getByRole("link", { name: "Vue d'ensemble" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.goto(`${PROJECT}/spec/functional`);
  await expect(sidebarOf(page).getByRole("link", { name: "Vue d'ensemble" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("la carte du Fonctionnel ouvre le cahier ; une carte « Bientôt » n'est pas dans la tabulation", async ({
  page,
}) => {
  await open(page, "framing");
  const grid = page.getByRole("region", { name: "Livrables du cadrage" });
  await grid.getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`${PROJECT}/spec/functional`));
  await page.goBack();
  await expect(heading(page)).toBeVisible();
  const soon = grid.getByText("Modèle de données").first();
  await expect(soon.locator("xpath=ancestor::a")).toHaveCount(0);
  await expect(grid.locator("a, button, [tabindex]:not([tabindex='-1'])")).toHaveCount(1);
});

test("Idée : dossier d'idée, « Ouvrir le dossier » mène à l'espace Idée", async ({ page }) => {
  await open(page, "idea");
  const list = page.getByRole("region", { name: "Dossier d'idée" });
  await expect(list.getByRole("listitem")).toHaveCount(4);
  await expect(list).toContainText("Utilisateurs");
  await list.getByRole("link", { name: /Ouvrir le dossier/ }).click();
  await expect(page).toHaveURL(new RegExp(`${PROJECT}/idea`));
});

test("Itérations : sprint et statuts de ticket ; sans sprint, « Aucun sprint en cours »", async ({
  page,
}) => {
  await open(page, "iterations");
  const list = page.getByRole("region", { name: "Sprint SP-7 · Rendre la réservation fiable" });
  await expect(list.getByRole("listitem")).toHaveCount(4);
  await expect(list).toContainText("En revue");
  await open(page, "noSprint");
  await expect(page.getByText("Aucun sprint en cours")).toBeVisible();
});

test("projet neuf, « Rien n'attend d'action. » et erreur de chargement avec Réessayer", async ({
  page,
}) => {
  await open(page, "new");
  await expect(page.getByText("Commencez le dossier d'idée").first()).toBeVisible();
  await expect(page.getByText("Le projet vient d'être créé.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Indicateurs" })).toHaveCount(0);
  await open(page, "neutral");
  await expect(page.getByRole("note", { name: "Prochaine étape" })).toContainText(
    "Rien n'attend d'action.",
  );
  await open(page, "error");
  await expect(page.getByText("Impossible de charger la vue d'ensemble.")).toBeVisible();
  await expect(sidebarOf(page)).toBeVisible();
  await setScenario({ session: true, projects: "data", overview: "framing" });
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("region", { name: "Phases du projet" })).toBeVisible();
});

test("vue client : sans « Inviter », sans SHA, étape tournée vers le client", async ({ page }) => {
  await open(page, "client");
  await expect(page.getByRole("link", { name: "Inviter" })).toHaveCount(0);
  await expect(page.getByRole("note", { name: "Prochaine étape" })).toContainText(
    "votre validation",
  );
  await expect(page.locator("body")).not.toContainText(/[0-9a-f]{7}\b.*spec à jour/);
});

test("chargement : squelettes aria-busy, puis le contenu", async ({ page }) => {
  await open(page, "loading");
  await expect(page.getByTestId("overview-skeleton")).toHaveAttribute("aria-busy", "true");
  // En développement, React rejoue l'effet : la requête retenue peut être relancée, on libère jusqu'à l'arrivée.
  await expect(async () => {
    await releaseHeld();
    await expect(page.getByRole("region", { name: "Phases du projet" })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });
});

test("« Voir toute l'activité · 214 » ouvre la page d'activité ; 50 puis 120 événements au défilement", async ({
  page,
}) => {
  await open(page, "framing");
  await page.getByRole("link", { name: /Voir toute l'activité/ }).click();
  await expect(page).toHaveURL(new RegExp(`${PROJECT}/activity$`));
  await expect(page.getByRole("heading", { level: 1, name: "Activité" })).toBeVisible();
  const feed = page.getByRole("list", { name: "Activité du projet" });
  await expect(feed.getByRole("listitem")).toHaveCount(50);
  await page.getByRole("button", { name: /Charger/ }).click();
  await expect(feed.getByRole("listitem")).toHaveCount(100);
  await page.getByRole("button", { name: /Charger/ }).click();
  await expect(feed.getByRole("listitem")).toHaveCount(120);
  await expect(page.getByRole("button", { name: /Charger/ })).toHaveCount(0);
});

test("clavier : « Relancer » au clavier copie le lien et annonce « Lien copié »", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "framing");
  const relaunch = page.getByRole("button", { name: "Relancer Marie" });
  await relaunch.focus();
  await expect(relaunch).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Lien copié" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${new URL(page.url()).origin}${PROJECT}/spec/functional`,
  );
  await expect(relaunch).toBeFocused();
});

test("clavier : l'ordre de tabulation suit l'ordre visuel (en-tête, étape, livrable, activité)", async ({
  page,
}) => {
  await open(page, "framing");
  await page.getByRole("heading", { level: 1 }).focus();
  const seen: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press("Tab");
    seen.push(
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute("aria-label") ??
          document.activeElement?.textContent?.trim() ??
          "",
      ),
    );
  }
  const index = (needle: RegExp) => seen.findIndex((text) => needle.test(text));
  // L'action principale précède la secondaire dans l'ordre de focus (DESIGN.md §5.4), puis l'étape, le livrable, l'activité.
  const order = [
    /Continuer le cadrage/,
    /Inviter/,
    /Relancer Marie/,
    /Cahier fonctionnel/,
    /Voir toute l'activité/,
  ];
  const found = order.map(index);
  expect(
    found.every((position) => position >= 0),
    seen.join(" | "),
  ).toBe(true);
  expect([...found].sort((x, y) => x - y)).toEqual(found);
});

test("375 px : fil vertical, bouton de l'étape de 44 px pleine largeur, aucun défilement horizontal", async ({
  page,
}) => {
  for (const mode of ["framing", "idea", "iterations", "client"] as const) {
    await open(page, mode, 375);
    await expect(heading(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, mode).toBeLessThanOrEqual(0);
  }
  await open(page, "framing", 375);
  const button = page.getByRole("button", { name: "Relancer Marie" });
  const box = await button.boundingBox();
  const note = await page.getByRole("note", { name: "Prochaine étape" }).boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect((box?.width ?? 0) / (note?.width ?? 1)).toBeGreaterThan(0.8);
  const steps = await page.getByRole("list", { name: "Phase du projet" }).locator("> li").all();
  const tops = await Promise.all(steps.map(async (step) => (await step.boundingBox())?.y ?? 0));
  expect(new Set(tops).size).toBe(4);
});

const MODES: OverviewMode[] = [
  "idea",
  "framing",
  "iterations",
  "new",
  "neutral",
  "noSprint",
  "client",
  "error",
];
for (const theme of ["light", "dark"] as const) {
  for (const mode of MODES) {
    test(`axe WCAG AA sans violation : vue d'ensemble ${mode} (${theme})`, async ({ page }) => {
      await open(page, mode);
      if (theme === "dark") await switchToDark(page);
      await expect(heading(page)).toBeVisible();
      await expect(page.getByTestId("overview-skeleton")).toHaveCount(0);
      await settle(page);
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations).toEqual([]);
    });
  }
}

test("axe : états de chargement, page d'activité et 375 px", async ({ page }) => {
  await open(page, "loading");
  await expect(heading(page)).toBeVisible();
  await settle(page);
  expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
  await releaseHeld();
  await open(page, "framing", 375);
  await expect(page.getByRole("region", { name: "Phases du projet" })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
  await page.goto(`${PROJECT}/activity`);
  await expect(page.getByRole("list", { name: "Activité du projet" })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
});
