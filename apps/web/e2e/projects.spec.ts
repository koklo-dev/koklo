import { expect, type Page, test } from "@playwright/test";
import {
  CAPTURES_DIR,
  menuOf,
  type ProjectsState,
  releaseHeld,
  setScenario,
  settle,
  sidebarOf,
  switchToDark,
} from "./support/helpers.ts";

const STATES: Array<{
  state: ProjectsState | "filtered" | "no-result";
  projects: Parameters<typeof setScenario>[0]["projects"];
  testId: string;
  path?: string;
}> = [
  { state: "loading", projects: "loading", testId: "projects-loading" },
  { state: "empty", projects: "empty", testId: "projects-empty" },
  { state: "data", projects: "data", testId: "projects-grid" },
  { state: "filtered", projects: "data", testId: "projects-grid", path: "?phase=framing" },
  { state: "no-result", projects: "data", testId: "projects-no-match", path: "?q=introuvable" },
  { state: "error", projects: "internal", testId: "projects-error" },
];
const VARIANTS = [
  { theme: "light", width: 1280 },
  { theme: "dark", width: 1280 },
  { theme: "mobile", width: 375 },
] as const;

/** Captures de S-projects (liste) : chaque état en clair, en sombre et à 375 px, dans design/screens/captures/S-projects/. */
for (const { theme, width } of VARIANTS) {
  for (const { state, projects, testId, path } of STATES) {
    test(`S-projects ${state} (${theme}) : état visible et capture`, async ({ page }) => {
      await setScenario({
        session: true,
        projects,
        ...(projects === "empty" ? {} : { cardsSet: "five" as const }),
      });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/projects${path ?? ""}`);
      if (theme === "dark") await switchToDark(page);
      await expect(page.getByTestId(testId)).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: "Projets" })).toBeVisible();
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^((?!dark).)*$/);
      await settle(page);
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
  await expect(sidebarOf(page).getByRole("link", { name: "Tous les projets" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(sidebarOf(page).getByText("Test", { exact: true })).toBeVisible();
  await expect(sidebarOf(page).getByText("test@example.com")).toBeVisible();
  await expect(page.getByRole("navigation", { name: /breadcrumb|fil d'ariane/i })).toHaveCount(0);
  await expect(page.locator('aside:not([data-slot="app-shell-sidebar"])')).toHaveCount(0);
  await expect(page.getByTestId("projects-grid").getByRole("link")).toHaveCount(3);
});

test("S-projects erreur : « Réessayer » relance la requête et affiche les données", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "internal" });
  await page.goto("/projects");
  await expect(page.getByTestId("projects-error")).toBeVisible();
  await setScenario({ session: true, projects: "data" });
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByTestId("projects-grid")).toBeVisible();
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
  // TK-85 : la sidebar est une Sheet sous 768 px : on l'ouvre, puis on mesure le menu utilisateur.
  await menuOf(page).click();
  const toggle = page.getByRole("dialog").getByRole("button", { name: "Menu utilisateur" });
  // La Sheet entre en 150 ms (échelle 0,97 → 1) : on mesure une fois la taille stabilisée.
  await expect
    .poll(async () => {
      const box = await toggle.boundingBox();
      return Math.min(box?.height ?? 0, box?.width ?? 0);
    })
    .toBeGreaterThanOrEqual(44);
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

const grid = (page: Page) => page.getByTestId("projects-grid");

test("S-projects : filtres de phase avec compteurs du serveur, état dans l'adresse", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data", cardsSet: "five" });
  await page.goto("/projects");
  const filters = page.getByRole("group", { name: "Filtrer par phase" });
  await expect(filters.getByRole("button", { name: /^Tous\s*5$/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(grid(page).getByRole("link")).toHaveCount(5);
  await filters.getByRole("button", { name: /^Cadrage/ }).click();
  await expect(page).toHaveURL(/\?phase=framing$/);
  await expect(grid(page).getByRole("link")).toHaveCount(2);
  await expect(filters.getByRole("button", { name: /^Cadrage/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(grid(page).getByRole("link")).toHaveCount(2);
  await filters.getByRole("button", { name: /^Tous/ }).click();
  await expect(grid(page).getByRole("link")).toHaveCount(5);
});

test("S-projects : recherche côté serveur, tri, et « Effacer les filtres »", async ({ page }) => {
  await setScenario({ session: true, projects: "data", cardsSet: "five" });
  await page.goto("/projects");
  await page.getByRole("searchbox", { name: "Rechercher un projet" }).fill("hexa");
  await expect(page).toHaveURL(/\?q=hexa$/);
  await expect(grid(page).getByRole("link")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Rechercher un projet" }).fill("zzz");
  await expect(page.getByTestId("projects-no-match")).toBeVisible();
  await page.getByRole("button", { name: "Effacer les filtres" }).click();
  await expect(grid(page).getByRole("link")).toHaveCount(5);
  await page.getByRole("button", { name: /Trié par/ }).click();
  await page.getByRole("menuitemradio", { name: "Nom" }).click();
  await expect(page).toHaveURL(/\?sort=name$/);
  await expect(grid(page).getByRole("link").first()).toHaveAccessibleName(/^Application caisse/);
});

test("S-projects : les pages suivantes se chargent à l'approche du bas, pied « Fin de la liste »", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data", cardsSet: "five", cardsPageSize: 2 });
  await page.goto("/projects");
  await expect(page.getByText("Fin de la liste · 5 projets")).toBeVisible();
  await expect(grid(page).getByRole("link")).toHaveCount(5);
});

test("S-projects : groupe Récents de la barre, trois tuiles au plus", async ({ page }) => {
  await setScenario({
    session: true,
    projects: "data",
    recent: [
      "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01",
      "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b02",
      "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b03",
    ],
  });
  await page.goto("/projects");
  const recents = sidebarOf(page).getByRole("group", { name: "Récents" });
  await expect(recents.getByRole("link")).toHaveCount(3);
  await expect(recents.getByRole("link").first()).toHaveAttribute("href", /\/projects\/7d1f6c1e/);
});

test("S-projects client : un seul projet redirige vers lui, plusieurs montrent la liste sans création", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data", role: "client", cardsAudience: "client" });
  await page.goto("/projects");
  await expect(grid(page).getByRole("link")).toHaveCount(3);
  await expect(page.getByTestId("create-project-button")).toHaveCount(0);
  await expect(grid(page).getByText("Marie Lefèvre")).toHaveCount(0);
  await page.goto("/projects?q=lumi");
  await expect(grid(page).getByRole("link")).toHaveCount(1);
  await expect(page).toHaveURL(/\/projects\?q=lumi$/);
  await setScenario({
    session: true,
    projects: "data",
    role: "client",
    cardsAudience: "client",
    clientOneProject: true,
  });
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/projects\/7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01$/);
});

test("S-projects 375 px : une colonne, pas de défilement horizontal, cibles de 44 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await setScenario({ session: true, projects: "data", cardsSet: "five" });
  await page.goto("/projects");
  await expect(grid(page).getByRole("link")).toHaveCount(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  const boxes = await grid(page)
    .getByRole("link")
    .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().left)));
  expect(new Set(boxes).size).toBe(1);
  for (const name of [/^Cadrage/, /^Itérations/]) {
    const box = await page
      .getByRole("group", { name: "Filtrer par phase" })
      .getByRole("button", { name })
      .boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
