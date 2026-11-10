import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  AXE_TAGS,
  CAPTURES_DIR,
  creationRetriesSeen,
  projectCreatesSeen,
  releaseHeld,
  setScenario,
  settle,
  switchToDark,
} from "./support/helpers.ts";

/**
 * TK-93 lot C : création de projet en une étape (boîte « Nouveau projet », carte de création, échecs du dépôt).
 * Pile locale : faux API (support/stub-spec-repo.ts) et navigateur réel. Aucune requête ne part vers github.com :
 * le dépôt est créé par le worker côté serveur, jamais par le navigateur.
 */
const NAME = "Atelier neuf";
const ACME_INSTALLATION = "01900000-0000-7000-8000-000000000101";
const VARIANTS = [
  { theme: "light", width: 1280, height: 900 },
  { theme: "dark", width: 1280, height: 900 },
  { theme: "mobile", width: 375, height: 800 },
] as const;

const dialogOf = (page: Page) => page.getByRole("dialog", { name: "Nouveau projet" });
const creationOf = (page: Page) => page.locator('[data-slot="project-card-creating"]');
const BASE = { session: true, projects: "data", installations: "single" } as const;

async function arrive(page: Page, variant: (typeof VARIANTS)[number]): Promise<void> {
  await page.setViewportSize({ width: variant.width, height: variant.height });
  await page.goto("/projects");
  if (variant.theme === "dark") await switchToDark(page);
}

async function openDialog(page: Page): Promise<void> {
  await page.getByTestId("create-project-button").click();
  await expect(dialogOf(page)).toBeVisible();
  await expect(dialogOf(page).getByRole("button", { name: "Créer le projet" })).toBeEnabled();
}

async function fillAndSubmit(page: Page): Promise<void> {
  await dialogOf(page).getByLabel("Nom du projet").fill(NAME);
  await dialogOf(page).getByRole("button", { name: "Créer le projet" }).click();
}

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

interface State {
  name: string;
  scenario: Parameters<typeof setScenario>[0];
  show: (page: Page) => Promise<void>;
}

/** Les 12 échecs de S-projects v7 §4.2, plus l'invitation : une carte en échec par code. */
const FAILURES: Array<[string, string]> = [
  ["no_account", "Aucun compte GitHub n'est relié."],
  ["name_taken", "est déjà pris sur acme-corp."],
  ["user_token_required", "Koklo a besoin de votre autorisation GitHub"],
  ["auth_expired_user", "L'autorisation GitHub a expiré."],
  ["auth_expired_installation", "L'accès de Koklo à ce compte GitHub a expiré."],
  ["resource_not_accessible", "GitHub refuse la création d'un dépôt sur acme-corp."],
  ["provider_unavailable", "GitHub ne répond pas."],
  ["rate_limited", "Réessayez dans environ 12 secondes."],
  ["account_unavailable", "Ce compte GitHub n'est plus disponible."],
  ["invalid_name", "Le nom du dépôt n'est pas accepté."],
  ["forbidden", "Vous n'avez plus le droit de créer un dépôt."],
  ["unknown", "Le dépôt de spec n'a pas pu être créé."],
];

const STATES: State[] = [
  {
    name: "create-dialog",
    scenario: { ...BASE, creationSeed: true, creation: "running" },
    show: async (page) => {
      await openDialog(page);
      await dialogOf(page).getByLabel("Nom du projet").fill(NAME);
      await expect(dialogOf(page)).toContainText("Dépôt créé sur acme-corp");
    },
  },
  {
    name: "create-dialog-multi",
    scenario: { ...BASE, installations: "data" },
    show: async (page) => {
      await openDialog(page);
      await expect(
        dialogOf(page).getByRole("combobox", { name: "Compte GitHub du dépôt de spec" }),
      ).toBeVisible();
    },
  },
  {
    name: "create-dialog-none",
    scenario: { ...BASE, installations: "empty" },
    show: async (page) => {
      await openDialog(page);
      await expect(dialogOf(page)).toContainText("Aucun compte GitHub n'est relié.");
    },
  },
  {
    name: "create-running",
    scenario: { ...BASE, creationSeed: true, creation: "running", creationInvitation: "done" },
    show: async (page) => {
      await expect(creationOf(page)).toContainText("Création du dépôt de spec sur GitHub…");
      await expect(creationOf(page)).toContainText("Invitation envoyée au client");
    },
  },
  ...FAILURES.map(([code, text]) => ({
    name: `create-fail-${code.replaceAll("_", "-")}`,
    scenario: { ...BASE, creationSeed: true, creation: code } as State["scenario"],
    show: async (page: Page) => {
      await expect(creationOf(page)).toContainText(text);
    },
  })),
  {
    name: "create-fail-invitation",
    scenario: { ...BASE, creationSeed: true, creation: "running", creationInvitation: "error" },
    show: async (page) => {
      await expect(creationOf(page)).toContainText("L'invitation n'a pas pu être envoyée.");
    },
  },
];

for (const variant of VARIANTS) {
  for (const { name, scenario, show } of STATES) {
    test(`S-projects ${name} (${variant.theme}) : état visible, capture et axe`, async ({
      page,
    }) => {
      await setScenario(scenario);
      await arrive(page, variant);
      await show(page);
      await expect(page.locator("html")).toHaveClass(
        variant.theme === "dark" ? /dark/ : /^((?!dark).)*$/,
      );
      await settle(page);
      await page.screenshot({
        path: `${CAPTURES_DIR}/S-projects/${name}-${variant.theme}.png`,
        fullPage: true,
      });
      if (variant.theme !== "mobile") {
        const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(results.violations).toEqual([]);
      }
      await releaseHeld();
    });
  }
}

const DESKTOP = VARIANTS[0];

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
test.describe("parcours de création", () => {
  test("nominal : un project.create, la carte de création, puis une carte normale ; le focus revient au bouton", async ({
    page,
  }) => {
    await setScenario({ ...BASE, creation: "finishing" });
    await arrive(page, DESKTOP);
    await openDialog(page);
    await fillAndSubmit(page);
    await expect(dialogOf(page)).toBeHidden();
    await expect(page.getByTestId("create-project-button")).toBeFocused();
    await expect(creationOf(page)).toContainText("Création du dépôt de spec sur GitHub…");
    const seen = await projectCreatesSeen();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      name: NAME,
      ideaTemplate: "default",
      installationId: ACME_INSTALLATION,
    });
    expect(String(seen[0]?.idempotencyKey).length).toBeGreaterThan(8);
    // Au sondage suivant (3 s) le dépôt est créé : la carte devient une carte normale.
    await expect(page.getByRole("link", { name: new RegExp(`^${NAME}`) })).toBeVisible({
      timeout: 10_000,
    });
    await expect(creationOf(page)).toHaveCount(0);
  });

  test("client invité, dossier vide et données en UE sont envoyés", async ({ page }) => {
    await setScenario({ ...BASE, creation: "succeeded" });
    await arrive(page, DESKTOP);
    await openDialog(page);
    await dialogOf(page).getByLabel("Client (facultatif)").fill("marie@salon.fr");
    await dialogOf(page)
      .getByRole("radio", { name: /Dossier vide/ })
      .click();
    await dialogOf(page).getByRole("switch").click();
    await fillAndSubmit(page);
    await expect(dialogOf(page)).toBeHidden();
    expect((await projectCreatesSeen())[0]).toMatchObject({
      clientEmail: "marie@salon.fr",
      ideaTemplate: "empty",
      euOnly: true,
    });
  });

  test("deux comptes : aucune présélection, envoi bloqué sans choix puis compte choisi", async ({
    page,
  }) => {
    await setScenario({ ...BASE, installations: "data", creation: "succeeded" });
    await arrive(page, DESKTOP);
    await openDialog(page);
    const select = dialogOf(page).getByRole("combobox", { name: "Compte GitHub du dépôt de spec" });
    await expect(select).toContainText("Choisir un compte");
    await fillAndSubmit(page);
    await expect(dialogOf(page)).toContainText("Choisissez le compte GitHub du dépôt.");
    expect(await projectCreatesSeen()).toEqual([]);
    await select.click();
    await page.getByRole("option", { name: /awa-kone/ }).click();
    await dialogOf(page).getByRole("button", { name: "Créer le projet" }).click();
    await expect(dialogOf(page)).toBeHidden();
    expect((await projectCreatesSeen())[0]).toMatchObject({
      installationId: "01900000-0000-7000-8000-000000000102",
    });
  });

  test("sans compte GitHub : la carte garde « Relier GitHub » vers les réglages", async ({
    page,
  }) => {
    await setScenario({ ...BASE, installations: "empty", creation: "no_account" });
    await arrive(page, DESKTOP);
    await openDialog(page);
    await fillAndSubmit(page);
    await expect(dialogOf(page)).toBeHidden();
    await expect(creationOf(page).getByRole("link", { name: "Relier GitHub" })).toHaveAttribute(
      "href",
      "/settings/github",
    );
    expect((await projectCreatesSeen())[0]).not.toHaveProperty("installationId");
  });

  test("échec puis « Réessayer » : project.retryRepo, puis carte normale", async ({ page }) => {
    await setScenario({
      ...BASE,
      creationSeed: true,
      creation: "provider_unavailable",
      retryTo: "succeeded",
    });
    await arrive(page, DESKTOP);
    await creationOf(page).getByRole("button", { name: "Réessayer" }).click();
    await expect(page.getByRole("link", { name: new RegExp(`^${NAME}`) })).toBeVisible();
    expect(await creationRetriesSeen()).toEqual([{}]);
  });

  test("nom pris : nouveau nom envoyé à project.retryRepo", async ({ page }) => {
    await setScenario({
      ...BASE,
      creationSeed: true,
      creation: "name_taken",
      retryTo: "succeeded",
    });
    await arrive(page, DESKTOP);
    const field = creationOf(page).getByLabel("Choisir un autre nom");
    await expect(field).toHaveValue("atelier-neuf-spec");
    await field.fill("atelier-v2-spec");
    await creationOf(page).getByRole("button", { name: "Réessayer" }).click();
    await expect(creationOf(page)).toHaveCount(0);
    expect(await creationRetriesSeen()).toEqual([{ repoName: "atelier-v2-spec" }]);
  });

  test("rechargement : la création en cours se réaffiche depuis l'état du serveur", async ({
    page,
  }) => {
    await setScenario({ ...BASE, creationSeed: true, creation: "running" });
    await arrive(page, DESKTOP);
    await expect(creationOf(page)).toContainText("Création du dépôt de spec sur GitHub…");
    await page.reload();
    await expect(creationOf(page)).toContainText("Création du dépôt de spec sur GitHub…");
    expect(await projectCreatesSeen()).toEqual([]);
  });

  test("Échap avec saisie demande confirmation ; « Continuer la saisie » garde la boîte", async ({
    page,
  }) => {
    await setScenario({ ...BASE });
    await arrive(page, DESKTOP);
    await openDialog(page);
    await expect(dialogOf(page).getByLabel("Nom du projet")).toBeFocused();
    await dialogOf(page).getByLabel("Nom du projet").fill(NAME);
    await page.keyboard.press("Escape");
    const confirm = page.getByRole("alertdialog", { name: "Abandonner la création ?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Continuer la saisie" }).click();
    await expect(dialogOf(page).getByLabel("Nom du projet")).toHaveValue(NAME);
    await dialogOf(page).getByRole("button", { name: "Annuler" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Abandonner" }).click();
    await expect(dialogOf(page)).toBeHidden();
    await expect(page.getByTestId("create-project-button")).toBeFocused();
  });

  test("375 px : boîte plein écran et carte de création sans défilement horizontal", async ({
    page,
  }) => {
    await setScenario({ ...BASE, creationSeed: true, creation: "name_taken" });
    await arrive(page, VARIANTS[2]);
    await expect(creationOf(page)).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(false);
    await openDialog(page);
    await expect.poll(async () => (await dialogOf(page).boundingBox())?.width).toBe(375);
    expect(await noHorizontalScroll(page)).toBe(false);
    const button = dialogOf(page).getByRole("button", { name: "Créer le projet" });
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  });
});
