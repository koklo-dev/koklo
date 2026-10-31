import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  CAPTURES_DIR,
  type KanbanRole,
  projectCreatesSeen,
  releaseHeld,
  setScenario,
  settle,
  sidebarOf,
  specReadsSeen,
  specRepoCallsSeen,
  switchToDark,
  type Theme,
} from "./support/helpers.ts";
import {
  FEATURE_PROJECT_ID,
  type FeatureMode,
  type SpecMode,
  UNKNOWN_PROJECT_ID,
} from "./support/stub-features.ts";

/**
 * TK-48 / 48d, liste des fonctionnalités d'un projet en lecture seule (design/screens/S-features.md §11, §12).
 * Pile locale : faux API (support/stub-features.ts) et navigateur réel ; jamais github.com ni Postgres.
 * Captures dans design/screens/captures/S-features/<état>-<thème>.png (+ -mobile à 375 px).
 */
/** Même référentiel que les autres specs : WCAG A/AA (les règles « best-practice » visent un autre périmètre). */
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];
const PATH = `/projects/${FEATURE_PROJECT_ID}/features`;
const FICHE_TITLE = "Connexion par e-mail";
const ids = (role?: KanbanRole) => (role ? { role } : {});

interface State {
  name: string;
  spec?: SpecMode;
  feature?: FeatureMode;
  role?: KanbanRole;
  path?: string;
  /** Action après le chargement (ouvrir la fiche...) : faite après la bascule de thème. */
  after?: (page: Page) => Promise<void>;
  /** Ce que la personne doit voir. */
  visible: (page: Page) => Promise<void>;
}

const openFiche = async (page: Page) => {
  await page.getByRole("link", { name: FICHE_TITLE }).click();
  await expect(page.getByRole("dialog", { name: FICHE_TITLE })).toBeVisible();
};
const heading = (name: string) => (page: Page) =>
  expect(page.getByRole("heading", { name })).toBeVisible();
const alertWith = (text: string | RegExp) => (page: Page) =>
  expect(page.getByRole("alert").filter({ hasText: text })).toBeVisible();

const STATES: State[] = [
  {
    name: "loading",
    spec: "loading",
    visible: (page) =>
      expect(page.getByRole("status")).toContainText("Chargement des fonctionnalités…"),
  },
  {
    name: "data",
    visible: (page) =>
      expect(page.getByRole("table", { name: /^Fonctionnalités du projet/ })).toBeVisible(),
  },
  { name: "empty", spec: "empty", visible: heading("Aucune fonctionnalité pour le moment") },
  {
    name: "empty-filtered",
    path: `${PATH}?priority=could`,
    visible: (page) =>
      expect(page.getByText("Aucune fonctionnalité ne correspond à ces filtres.")).toBeVisible(),
  },
  { name: "preparing", spec: "building", visible: heading("La spec est en cours de préparation") },
  {
    name: "no-repo-manager",
    spec: "noSpec",
    visible: heading("Ce projet n'a pas de dépôt de spec"),
  },
  {
    name: "no-repo-dev",
    spec: "noSpec",
    role: "dev",
    visible: heading("Ce projet n'a pas de dépôt de spec"),
  },
  {
    name: "unavailable-client",
    spec: "noSpec",
    role: "client",
    visible: heading("Aucune fonctionnalité à afficher pour le moment"),
  },
  { name: "index-failed", spec: "failed", visible: alertWith("La spec n'a pas pu être lue") },
  {
    name: "list-error",
    spec: "listError",
    visible: alertWith("Impossible de charger les fonctionnalités"),
  },
  {
    name: "not-found",
    path: `/projects/${UNKNOWN_PROJECT_ID}/features`,
    visible: heading("Projet introuvable"),
  },
  {
    name: "feature-sheet",
    after: openFiche,
    visible: (page) => expect(page.getByText("Critères d'acceptation")).toBeVisible(),
  },
  {
    name: "feature-sheet-client",
    role: "client",
    after: openFiche,
    visible: (page) => expect(page.getByText("Critères d'acceptation")).toBeVisible(),
  },
  {
    name: "feature-error-provider",
    feature: "unavailable",
    after: openFiche,
    visible: alertWith("Le détail est momentanément indisponible"),
  },
  {
    name: "feature-error-auth",
    feature: "authExpired",
    after: openFiche,
    visible: alertWith("Koklo n'a plus accès au dépôt de spec"),
  },
];

async function capture(page: Page, name: string, theme: Theme, suffix = ""): Promise<void> {
  await settle(page);
  await page.screenshot({
    path: `${CAPTURES_DIR}/S-features/${name}-${theme}${suffix}.png`,
    fullPage: true,
  });
}

async function arrive(page: Page, state: State, theme: Theme): Promise<void> {
  await setScenario({
    session: true,
    projects: "data",
    installations: "single",
    ...(state.spec ? { spec: state.spec } : {}),
    ...(state.feature ? { feature: state.feature } : {}),
    ...ids(state.role),
  });
  await page.goto(state.path ?? PATH);
  if (theme === "dark") await switchToDark(page);
  if (state.after) await state.after(page);
  await state.visible(page);
}

for (const theme of ["light", "dark"] as Theme[]) {
  for (const state of STATES) {
    test(`S-features ${state.name} (${theme}) : état visible, axe sans violation, capture`, async ({
      page,
    }) => {
      await arrive(page, state, theme);
      // `includeHidden` : sous une fiche modale, le reste de la page est volontairement masqué aux lecteurs d'écran.
      await expect(
        page.getByRole("heading", { level: 1, name: "Fonctionnalités", includeHidden: true }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^((?!dark).)*$/);
      await capture(page, state.name, theme);
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations, JSON.stringify(results.violations.map((v) => v.id))).toEqual([]);
      await releaseHeld();
    });
  }
}

test("S-features : accès depuis la liste des projets et la barre latérale", async ({ page }) => {
  await setScenario({ session: true, projects: "data" });
  await page.goto("/projects");
  await page.getByRole("link", { name: /^Atelier Lumière\s?:\s?fonctionnalités$/ }).click();
  await expect(page).toHaveURL(new RegExp(`${PATH}$`));
  const current = sidebarOf(page).getByRole("link", { name: /Atelier Lumière/ });
  await expect(current).toHaveAttribute("aria-current", "page");
  await expect(
    sidebarOf(page).getByRole("link", { name: /Portail partenaires/ }),
  ).not.toHaveAttribute("aria-current", "page");
  await sidebarOf(page)
    .getByRole("link", { name: /Portail partenaires/ })
    .click();
  await expect(page).toHaveURL(/\/projects\/7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b03\/features$/);
  const crumbs = page.getByRole("navigation", { name: /breadcrumb|fil d'ariane/i });
  await expect(crumbs).toContainText("Portail partenaires");
  await expect(crumbs.getByRole("link", { name: "Projets" })).toHaveAttribute("href", "/projects");
});

test("S-features : la route dynamique est gardée (sans session /login, sans organisation /organizations)", async ({
  page,
}) => {
  await setScenario({ session: false, projects: "data" });
  await page.goto(PATH);
  await expect(page).toHaveURL(/\/login/);
  await setScenario({ session: true, projects: "data", activeOrganization: false });
  await page.goto(PATH);
  await expect(page).toHaveURL(/\/organizations/);
});

test("S-features : une route voisine inexistante n'est pas servie (404)", async ({ page }) => {
  await setScenario({ session: true, projects: "data" });
  const response = await page.goto(`${PATH}/x`);
  expect(response?.status()).toBe(404);
});

test("S-features : filtres dans l'adresse, requête relancée, « Effacer les filtres »", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data" });
  await page.goto(PATH);
  await expect(page.getByRole("row")).toHaveCount(4);
  await page.getByRole("combobox", { name: "Statut" }).click();
  await page.getByRole("option", { name: "Brouillon" }).click();
  await expect(page).toHaveURL(/status=brouillon/);
  await expect(page.getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("link", { name: FICHE_TITLE })).toBeVisible();
  await page.getByRole("button", { name: "Effacer les filtres" }).click();
  await expect(page.getByRole("row")).toHaveCount(4);
  await expect(page).not.toHaveURL(/status=/);
  await expect(page.getByRole("combobox", { name: "Statut" })).toBeFocused();
  const reads = await specReadsSeen();
  expect(reads.some((read) => read.includes("status=brouillon"))).toBe(true);
});

test("S-features : fiche ouverte au clavier, lien partageable, Retour et Échap la ferment", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data" });
  await page.goto(PATH);
  const link = page.getByRole("link", { name: FICHE_TITLE });
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/feature=F-001/);
  const dialog = page.getByRole("dialog", { name: FICHE_TITLE });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: FICHE_TITLE })).toBeFocused();
  await page.goBack();
  await expect(dialog).toBeHidden();
  await page.goForward();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(link).toBeFocused();
  await page.goto(`${PATH}?feature=F-002`);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goto(`${PATH}?feature=F-1`);
  await expect(page.getByRole("table", { name: /^Fonctionnalités du projet/ })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("S-features : « Afficher plus de fonctionnalités » ajoute la page suivante puis disparaît", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data", spec: "paginated" });
  await page.goto(PATH);
  await expect(page.getByRole("row")).toHaveCount(51);
  await page.getByRole("button", { name: "Afficher plus de fonctionnalités" }).click();
  await expect(page.getByRole("row")).toHaveCount(61);
  await expect(page.getByRole("button", { name: "Afficher plus de fonctionnalités" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("status")).toContainText("10 fonctionnalités de plus affichées.");
});

test("S-features : « Actualiser » une spec en préparation devenue prête affiche la liste", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data", spec: "building" });
  await page.goto(PATH);
  await expect(
    page.getByRole("heading", { name: "La spec est en cours de préparation" }),
  ).toBeVisible();
  await setScenario({ session: true, projects: "data", spec: "ready" });
  await page.getByRole("button", { name: "Actualiser" }).click();
  await expect(page.getByRole("table", { name: /^Fonctionnalités du projet/ })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("La spec est prête.");
});

test("S-features : reprise du dépôt de spec d'un projet créé sans dépôt (propriétaire)", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data", spec: "noSpec", installations: "single" });
  await page.goto(PATH);
  await page.getByRole("button", { name: "Créer le dépôt de spec" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Nom du projet")).toHaveCount(0);
  await expect(
    dialog.getByRole("list", { name: "Étapes de la création" }).getByRole("listitem").first(),
  ).toContainText("Terminé");
  await dialog.getByRole("button", { name: "Créer le dépôt" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "La spec est en cours de préparation" }),
  ).toBeVisible();
  expect(await projectCreatesSeen()).toEqual([]);
  const calls = await specRepoCallsSeen();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ projectId: FEATURE_PROJECT_ID });
});

test("S-features : développeur et designer lisent le texte sans bouton de création", async ({
  page,
}) => {
  for (const role of ["dev", "designer"] as KanbanRole[]) {
    await setScenario({ session: true, projects: "data", spec: "noSpec", role });
    await page.goto(PATH);
    await expect(
      page.getByText("Un propriétaire ou un administrateur peut le créer."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Créer le dépôt/ })).toHaveCount(0);
  }
});

test("S-features : client et business n'appellent jamais repo.list", async ({ page }) => {
  for (const role of ["client", "business"] as KanbanRole[]) {
    await setScenario({ session: true, projects: "data", spec: "noSpec", role });
    await page.goto(PATH);
    await expect(
      page.getByRole("heading", { name: "Aucune fonctionnalité à afficher pour le moment" }),
    ).toBeVisible();
    expect((await specReadsSeen()).some((read) => read.endsWith("/repos"))).toBe(false);
  }
});

test("S-features : AC-48-28, la vue client ne montre aucun terme git, chemin ni version", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data", role: "client" });
  await page.goto(PATH);
  await openFiche(page);
  const text = await page.locator("body").textContent();
  const html = await page.content();
  expect(text).not.toMatch(
    /commit|branche|branch|\bSHA\b|version de la spec|\.ya?ml|\.koklo|dépôt git/i,
  );
  expect(html).not.toMatch(/a1b2c3d|\.koklo\/features|spec_too_large/);
  expect(text).not.toMatch(/Tables|Endpoints|Exigences non fonctionnelles/);
  await expect(page.getByText("Écrans")).toBeVisible();
  await expect(page.getByText("Mise à jour le").first()).toBeVisible();
});

test("S-features : l'équipe voit la version et le fichier", async ({ page }) => {
  await setScenario({ session: true, projects: "data", role: "dev" });
  await page.goto(PATH);
  await expect(page.getByLabel("Version de la spec a1b2c3d").first()).toBeVisible();
  await openFiche(page);
  await expect(page.getByText(".koklo/features/F-001.yaml")).toBeVisible();
  await expect(page.getByText("Tables")).toBeVisible();
});

test("S-features : liens d'erreur de la fiche (owner : /github ; dev : texte seul)", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data", feature: "authExpired", role: "owner" });
  await page.goto(PATH);
  await openFiche(page);
  await expect(page.getByRole("link", { name: "Ouvrir la page GitHub" })).toHaveAttribute(
    "href",
    "/github",
  );
  await setScenario({ session: true, projects: "data", feature: "authExpired", role: "dev" });
  await page.goto(PATH);
  await openFiche(page);
  await expect(
    page.getByText(
      "Demandez à un propriétaire ou à un administrateur d'autoriser de nouveau Koklo.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Ouvrir la page GitHub" })).toHaveCount(0);
});

test("S-features : mouvement réduit, aucun squelette animé", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setScenario({ session: true, projects: "data", spec: "loading" });
  await page.goto(PATH);
  await expect(page.getByRole("status")).toContainText("Chargement des fonctionnalités…");
  const animations = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations === Number.POSITIVE_INFINITY).length,
  );
  expect(animations).toBe(0);
  await releaseHeld();
});

test.describe("375 px", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("data-mobile : colonnes réduites, ligne méta, aucun défilement horizontal, capture", async ({
    page,
  }) => {
    await setScenario({ session: true, projects: "data" });
    await page.goto(PATH);
    const table = page.getByRole("table", { name: /^Fonctionnalités du projet/ });
    await expect(table).toBeVisible();
    for (const name of ["Statut", "Priorité", "Critères"]) {
      await expect(page.getByRole("columnheader", { name })).toHaveCount(0);
    }
    // La ligne méta (statut · priorité · critères) remplace les colonnes masquées ; la cellule Priorité reste masquée.
    await expect(table.getByText(/Brouillon · Indispensable · 3 critères/)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await capture(page, "data", "light", "-mobile");
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("feature-sheet-mobile : fiche pleine largeur, capture", async ({ page }) => {
    await setScenario({ session: true, projects: "data" });
    await page.goto(PATH);
    await openFiche(page);
    // La fiche glisse depuis la droite : on mesure une fois l'animation terminée.
    await settle(page);
    const box = await page.getByRole("dialog").boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(370);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await capture(page, "feature-sheet", "light", "-mobile");
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
