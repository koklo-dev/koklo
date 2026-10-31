import { expect, test } from "@playwright/test";
import {
  CAPTURES_DIR,
  githubStartsSeen,
  releaseHeld,
  setScenario,
  settle,
  sidebarOf,
  switchToDark,
  type Theme,
} from "./support/helpers.ts";
import { FAKE_GITHUB_URL, type GithubScenario } from "./support/stub-github.ts";

/**
 * TK-48b, écran /github. Pile locale : faux API (support/stub-github.ts) et navigateur réel.
 * Aucune requête ne part vers github.com : toute navigation vers cet hôte est interceptée et remplie
 * par un faux fournisseur (`fakeGithub`), jamais laissée sortir.
 */
const INSTALL = "Installer l'application GitHub";

async function fakeGithub(page: import("@playwright/test").Page): Promise<string[]> {
  const reached: string[] = [];
  await page.route(/^https:\/\/(?!127\.0\.0\.1)[^/]*github\.com\//, (route) => {
    reached.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Faux GitHub</h1>" });
  });
  return reached;
}

const open = async (
  page: import("@playwright/test").Page,
  scenario: GithubScenario & { role?: "dev" | "owner" },
) => {
  await setScenario({ session: true, projects: "data", ...scenario });
  await page.goto("/github");
};

const STATES: Array<{ state: string; scenario: GithubScenario; testId: RegExp | string }> = [
  { state: "loading", scenario: { installations: "loading" }, testId: "github-page" },
  { state: "empty", scenario: { installations: "empty" }, testId: "github-page" },
  { state: "data", scenario: { installations: "data" }, testId: "github-page" },
  { state: "error", scenario: { installations: "internal" }, testId: "github-page" },
];

for (const theme of ["light", "dark"] as Theme[]) {
  for (const { state, scenario } of STATES) {
    test(`S-github ${state} (${theme}) : état visible et capture`, async ({ page }) => {
      await open(page, scenario);
      if (theme === "dark") await switchToDark(page);
      await expect(page.getByTestId("github-page")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: "GitHub" })).toBeVisible();
      const expected = {
        loading: "Chargement des installations GitHub…",
        empty: "Aucune application GitHub installée",
        data: "acme-corp",
        error: "Impossible de charger les installations",
      }[state] as string;
      await expect(page.getByText(expected).first()).toBeVisible();
      await settle(page);
      await page.screenshot({
        path: `${CAPTURES_DIR}/S-github/${state}-${theme}.png`,
        fullPage: true,
      });
      await releaseHeld();
    });
  }
}

test("S-github : le propriétaire voit l'entrée « GitHub » active dans la navigation et le fil d'Ariane", async ({
  page,
}) => {
  await open(page, { installations: "empty" });
  const link = sidebarOf(page).getByRole("link", { name: "GitHub" });
  await expect(link).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: /breadcrumb|fil d'ariane/i })).toContainText(
    "GitHub",
  );
});

test("S-github : liste, un statut = icône + texte, actions « Autoriser » / « Réautoriser »", async ({
  page,
}) => {
  await open(page, { installations: "data" });
  await expect(
    page.getByRole("list", { name: "Installations GitHub" }).getByRole("listitem"),
  ).toHaveCount(5);
  for (const label of [
    "Active",
    "Suspendue",
    "Désinstallée",
    "Autorisée",
    "À autoriser",
    "Autorisation expirée",
  ]) {
    const badge = page.getByText(label, { exact: true }).first();
    await expect(badge).toBeVisible();
    await expect(badge.locator("svg")).toHaveCount(1);
  }
  await expect(page.getByRole("button", { name: "Autoriser Koklo sur awa-kone" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Réautoriser Koklo sur vieux-studio" }),
  ).toBeVisible();
  const suspended = page.getByRole("listitem").filter({ hasText: "pause-sa" });
  await expect(suspended.getByRole("button")).toHaveCount(0);
});

test("S-github : « Installer » mène jusqu'à l'URL fournie par l'API (interceptée, jamais github.com)", async ({
  page,
}) => {
  const reached = await fakeGithub(page);
  await open(page, { installations: "empty", start: "ok" });
  await page.getByRole("button", { name: INSTALL }).click();
  await expect(page).toHaveURL(FAKE_GITHUB_URL);
  await expect(page.getByRole("heading", { name: "Faux GitHub" })).toBeVisible();
  expect(await githubStartsSeen()).toEqual([{}]);
  expect(reached).toEqual([FAKE_GITHUB_URL]);
});

test("S-github : « Réautoriser » envoie l'installationId de la ligne", async ({ page }) => {
  await fakeGithub(page);
  await open(page, { installations: "data", start: "ok" });
  await page.getByRole("button", { name: "Réautoriser Koklo sur vieux-studio" }).click();
  await expect(page).toHaveURL(FAKE_GITHUB_URL);
  expect(await githubStartsSeen()).toEqual([
    { installationId: "01900000-0000-7000-8000-000000000103" },
  ]);
});

test("S-github : une URL reçue hors github.com est refusée, aucune navigation", async ({
  page,
}) => {
  const reached = await fakeGithub(page);
  await open(page, { installations: "empty", start: "badUrl" });
  await page.getByRole("button", { name: INSTALL }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText(
    "Impossible de lancer l'installation",
  );
  await expect(page).toHaveURL(/\/github$/);
  expect(reached).toEqual([]);
  await expect(page.getByRole("button", { name: INSTALL })).toBeEnabled();
});

for (const theme of ["light", "dark"] as Theme[]) {
  for (const { name, start, title } of [
    {
      name: "start-unavailable",
      start: "unavailable",
      title: "L'installation n'est pas disponible pour le moment",
    },
    { name: "start-too-many", start: "tooManyPending", title: "Trop de tentatives en cours" },
  ] as const) {
    test(`S-github ${name} (${theme}) : alerte visible et capture`, async ({ page }) => {
      await open(page, { installations: "empty", start });
      if (theme === "dark") await switchToDark(page);
      await page.getByRole("button", { name: INSTALL }).click();
      await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText(title);
      await expect(page.getByRole("button", { name: INSTALL })).toBeEnabled();
      await settle(page);
      await page.screenshot({
        path: `${CAPTURES_DIR}/S-github/${name}-${theme}.png`,
        fullPage: true,
      });
    });
  }
}

const RESULTS = [
  ["installed", "status", "Application GitHub installée"],
  ["denied", "alert", "Installation non terminée"],
  ["invalid_state", "alert", "Ce retour depuis GitHub n'est plus valable"],
  ["already_linked", "alert", "Installation déjà utilisée"],
  ["not_owner", "alert", "Seul le propriétaire du compte peut faire cette liaison"],
  ["provider_error", "alert", "GitHub n'a pas répondu comme prévu"],
] as const;

for (const theme of ["light", "dark"] as Theme[]) {
  for (const [result, role, title] of RESULTS) {
    test(
      `S-github retour ?result=${result} (${theme}) : message %s, paramètre retiré, jamais rejoué`.replace(
        "%s",
        role,
      ),
      async ({ page }) => {
        await setScenario({ session: true, projects: "data", installations: "data" });
        await page.goto(`/github?result=${result}`);
        if (theme === "dark") await switchToDark(page);
        await expect(page.getByRole(role).filter({ hasText: title })).toBeVisible();
        await expect(page).toHaveURL(/\/github$/);
        await settle(page);
        await page.screenshot({
          path: `${CAPTURES_DIR}/S-github/result-${result}-${theme}.png`,
          fullPage: true,
        });
        await page.reload();
        await expect(page.getByRole("heading", { level: 2, name: "acme-corp" })).toBeVisible();
        await expect(page.getByText(title)).toHaveCount(0);
      },
    );
  }
}

test("S-github : un résultat inconnu n'affiche rien et sa valeur n'est jamais rendue", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data", installations: "data" });
  await page.goto("/github?result=%3Cimg%20src%3Dx%3E");
  await expect(page.getByRole("heading", { level: 2, name: "acme-corp" })).toBeVisible();
  await expect(page.getByText("<img")).toHaveCount(0);
  for (const [, , title] of RESULTS) await expect(page.getByText(title)).toHaveCount(0);
});

test("S-github : un développeur n'a ni l'entrée de navigation ni un appel d'API, et lit un refus sans action", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/provider/installations")) calls.push(request.url());
  });
  await open(page, { installations: "data", role: "dev" });
  await expect(page.getByText(/Cette page est réservée aux propriétaires/)).toBeVisible();
  await expect(sidebarOf(page).getByRole("link", { name: "Membres" })).toBeVisible();
  await expect(sidebarOf(page).getByRole("link", { name: "GitHub" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: INSTALL })).toHaveCount(0);
  expect(calls).toEqual([]);
});

test("S-github : sans session, /github renvoie vers /login", async ({ page }) => {
  await setScenario({ session: false, projects: "data" });
  await page.goto("/github");
  await expect(page).toHaveURL(/\/login/);
});

test("S-github : sans organisation active, /github renvoie vers /organizations", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data", activeOrganization: false });
  await page.goto("/github");
  await expect(page).toHaveURL(/\/organizations$/);
});

test("S-github mobile 375 px : aucun défilement horizontal, boutons de 44 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page, { installations: "data" });
  await expect(page.getByRole("heading", { level: 2, name: "acme-corp" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  for (const name of [
    INSTALL,
    "Autoriser Koklo sur awa-kone",
    "Réautoriser Koklo sur vieux-studio",
  ]) {
    const box = await page.getByRole("button", { name }).boundingBox();
    expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
  }
  await settle(page);
  await page.screenshot({ path: `${CAPTURES_DIR}/S-github/data-mobile.png`, fullPage: true });
});

test("S-github mouvement réduit : le squelette de chargement ne pulse pas", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, { installations: "loading" });
  const status = page
    .getByRole("status")
    .filter({ hasText: "Chargement des installations GitHub…" });
  await expect(status).toBeVisible();
  const names = await status
    .locator("div")
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
  expect(names.length).toBeGreaterThan(0);
  expect(names.every((name) => name === "none")).toBe(true);
  await releaseHeld();
});
