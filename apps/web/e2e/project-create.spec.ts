import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  CAPTURES_DIR,
  githubStartsSeen,
  projectCreatesSeen,
  releaseHeld,
  repoLinksSeen,
  setScenario,
  settle,
  specRepoCallsSeen,
  switchToDark,
  type Theme,
} from "./support/helpers.ts";
import { FAKE_GITHUB_URL, type GithubScenario } from "./support/stub-github.ts";
import { CREATED_PROJECT_ID, type SpecRepoScenario } from "./support/stub-spec-repo.ts";

/**
 * TK-48 / 48c, création de projet avec dépôt de spec (design/screens/S-projects.md section 11).
 * Pile locale : faux API (support/stub-spec-repo.ts) et navigateur réel. Aucune requête ne part vers
 * github.com : toute navigation vers cet hôte est interceptée par un faux fournisseur (`fakeGithub`).
 */
const NAME = "Atelier neuf";
const ACME_INSTALLATION = "01900000-0000-7000-8000-000000000101";
const MARKER_KEY = "koklo:project-creation-resume";
type Scenario = GithubScenario & SpecRepoScenario & { role?: "dev" | "owner" };

const dialogOf = (page: Page) => page.getByRole("dialog", { name: "Créer un projet" });
const stepOf = (page: Page, index: 0 | 1) =>
  page.getByRole("list", { name: "Étapes de la création" }).getByRole("listitem").nth(index);

async function fakeGithub(page: Page): Promise<string[]> {
  const reached: string[] = [];
  await page.route(/^https:\/\/(?!127\.0\.0\.1)[^/]*github\.com\//, (route) => {
    reached.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Faux GitHub</h1>" });
  });
  return reached;
}

async function open(page: Page, scenario: Scenario, theme: Theme = "light"): Promise<void> {
  await setScenario({ session: true, projects: "data", installations: "single", ...scenario });
  await page.goto("/projects");
  if (theme === "dark") await switchToDark(page);
  await page.getByTestId("create-project-button").click();
  await expect(dialogOf(page)).toBeVisible();
}

async function fillAndSubmit(page: Page, repoName?: string): Promise<void> {
  const dialog = dialogOf(page);
  await dialog.getByLabel("Nom du projet").fill(NAME);
  if (repoName) await dialog.getByLabel("Nom du dépôt (facultatif)").fill(repoName);
  await dialog.getByRole("button", { name: "Créer le projet" }).click();
}

const notEmptyAlert = (page: Page) => dialogOf(page).getByRole("alert").filter({ hasText: /\S/ });

async function capture(page: Page, name: string, theme: Theme): Promise<void> {
  await settle(page);
  await page.screenshot({
    path: `${CAPTURES_DIR}/S-projects/${name}-${theme}.png`,
    fullPage: true,
  });
}

interface State {
  name: string;
  scenario: Scenario;
  arrive: (page: Page) => Promise<void>;
}

const partial = async (page: Page, repoName?: string) => {
  await fillAndSubmit(page, repoName);
  await expect(notEmptyAlert(page)).toContainText("Projet créé, dépôt de spec non créé");
};

const STATES: State[] = [
  {
    name: "create-form",
    scenario: {},
    arrive: async (page) => {
      await expect(dialogOf(page)).toContainText("Compte GitHub : acme-corp");
    },
  },
  {
    name: "create-form-multi",
    scenario: { installations: "data" },
    arrive: async (page) => {
      await expect(dialogOf(page).getByRole("combobox", { name: "Compte GitHub" })).toBeVisible();
    },
  },
  {
    name: "create-no-account",
    scenario: { installations: "empty" },
    arrive: async (page) => {
      await expect(dialogOf(page)).toContainText("Aucun compte GitHub n'est relié.");
    },
  },
  {
    name: "create-step1",
    scenario: { projectCreate: "loading" },
    arrive: async (page) => {
      await fillAndSubmit(page);
      await expect(stepOf(page, 0)).toContainText("En cours…");
    },
  },
  {
    name: "create-step2",
    scenario: { specRepo: "loading" },
    arrive: async (page) => {
      await fillAndSubmit(page);
      await expect(stepOf(page, 1)).toContainText("En cours…");
      await expect(stepOf(page, 0)).toContainText("Terminé");
    },
  },
  {
    name: "create-partial",
    scenario: { specRepo: "unavailable" },
    arrive: (page) => partial(page),
  },
  {
    name: "create-partial-token",
    scenario: { specRepo: "tokenRequired" },
    arrive: async (page) => {
      await partial(page);
      await expect(
        dialogOf(page).getByRole("button", { name: "Autoriser Koklo sur acme-corp" }),
      ).toBeVisible();
    },
  },
  {
    name: "create-partial-name-taken",
    scenario: { specRepo: "nameTaken" },
    arrive: async (page) => {
      await partial(page, "mon-depot");
      await expect(dialogOf(page).getByLabel("Nom du dépôt (facultatif)")).toBeFocused();
    },
  },
  {
    name: "create-done",
    scenario: {},
    arrive: async (page) => {
      await fillAndSubmit(page);
      await expect(dialogOf(page)).toBeHidden();
      await expect(
        page.getByRole("status").filter({ hasText: `Projet « ${NAME} » et dépôt de spec créés.` }),
      ).toBeVisible();
    },
  },
  {
    name: "resume-notice",
    scenario: { specRepo: "unavailable" },
    arrive: async (page) => {
      await partial(page);
      await dialogOf(page).getByRole("button", { name: "Fermer" }).click();
      await expect(dialogOf(page)).toBeHidden();
      await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText(
        `Projet « ${NAME} » : dépôt de spec non créé`,
      );
    },
  },
];

for (const theme of ["light", "dark"] as Theme[]) {
  for (const { name, scenario, arrive } of STATES) {
    test(`S-projects ${name} (${theme}) : état visible, capture et axe`, async ({ page }) => {
      await open(page, scenario, theme);
      await arrive(page);
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^((?!dark).)*$/);
      await capture(page, name, theme);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
      await releaseHeld();
    });
  }
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
test.describe("parcours (AC-48-19 à AC-48-22)", () => {
  test("nominal : un project.create puis un repo.createSpec, dans cet ordre, sans nom de dépôt", async ({
    page,
  }) => {
    await open(page, {});
    await expect(dialogOf(page).getByRole("combobox")).toHaveCount(0);
    await fillAndSubmit(page);
    await expect(dialogOf(page)).toBeHidden();
    expect(await projectCreatesSeen()).toEqual([{ name: NAME }]);
    expect(await specRepoCallsSeen()).toEqual([
      { projectId: CREATED_PROJECT_ID, installationId: ACME_INSTALLATION },
    ]);
    await expect(page.getByTestId("create-project-button")).toBeFocused();
    await expect(page.getByRole("cell", { name: NAME })).toBeVisible();
  });

  test("le nom de dépôt saisi est envoyé", async ({ page }) => {
    await open(page, {});
    await fillAndSubmit(page, "mon-depot");
    await expect(dialogOf(page)).toBeHidden();
    expect((await specRepoCallsSeen())[0]).toMatchObject({ name: "mon-depot" });
  });

  test("nom de dépôt invalide : refusé avant tout appel", async ({ page }) => {
    await open(page, {});
    await fillAndSubmit(page, "x.git");
    await expect(dialogOf(page).getByLabel("Nom du dépôt (facultatif)")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(await projectCreatesSeen()).toEqual([]);
  });

  test("deux comptes actifs : aucune présélection, envoi bloqué sans choix, puis compte choisi envoyé", async ({
    page,
  }) => {
    await open(page, { installations: "data" });
    const select = dialogOf(page).getByRole("combobox", { name: "Compte GitHub" });
    await expect(select).toContainText("Choisir un compte");
    await fillAndSubmit(page);
    await expect(dialogOf(page)).toContainText("Choisissez le compte GitHub du dépôt.");
    expect(await projectCreatesSeen()).toEqual([]);
    await select.click();
    await page.getByRole("option", { name: "awa-kone · Compte personnel" }).click();
    await dialogOf(page).getByRole("button", { name: "Créer le projet" }).click();
    await expect(dialogOf(page)).toBeHidden();
    expect((await specRepoCallsSeen())[0]).toMatchObject({
      installationId: "01900000-0000-7000-8000-000000000102",
    });
  });

  test("sans compte GitHub : projet créé, aucun createSpec, lien vers /github", async ({
    page,
  }) => {
    await open(page, { installations: "empty" });
    await fillAndSubmit(page);
    await expect(dialogOf(page)).toContainText("créé, sans dépôt de spec");
    expect(await projectCreatesSeen()).toEqual([{ name: NAME }]);
    expect(await specRepoCallsSeen()).toEqual([]);
    await expect(dialogOf(page).getByRole("link", { name: "Relier GitHub" })).toHaveAttribute(
      "href",
      "/github",
    );
    await expect(stepOf(page, 1)).toContainText("Non créé : aucun compte GitHub relié");
  });

  test("échec partiel puis réessai réussi : un seul project.create, deux repo.createSpec", async ({
    page,
  }) => {
    await open(page, { specRepo: "failOnceThenOk" });
    await partial(page);
    await expect(stepOf(page, 0)).toContainText("Terminé");
    await expect(stepOf(page, 1)).toContainText("Non créé");
    await dialogOf(page).getByRole("button", { name: "Réessayer" }).click();
    await expect(dialogOf(page)).toBeHidden();
    await expect(
      page.getByRole("status").filter({ hasText: `Projet « ${NAME} » et dépôt de spec créés.` }),
    ).toBeVisible();
    expect(await projectCreatesSeen()).toHaveLength(1);
    expect(await specRepoCallsSeen()).toHaveLength(2);
  });

  test("spec_repo_exists est un succès, pas une erreur", async ({ page }) => {
    await open(page, { specRepo: "exists" });
    await fillAndSubmit(page);
    await expect(dialogOf(page)).toContainText("Ce projet a déjà son dépôt de spec.");
    await expect(stepOf(page, 1)).toContainText("Terminé");
    await expect(notEmptyAlert(page)).toHaveCount(0);
  });

  test("fermeture bloquée pendant un appel : Échap et clic hors panneau sans effet", async ({
    page,
  }) => {
    await open(page, { projectCreate: "loading" });
    await fillAndSubmit(page);
    await expect(stepOf(page, 0)).toContainText("En cours…");
    await page.keyboard.press("Escape");
    await expect(dialogOf(page)).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(dialogOf(page)).toBeVisible();
    await expect(dialogOf(page).getByRole("button", { name: "Annuler" })).toBeDisabled();
    await releaseHeld();
  });

  test("rôle développeur : aucun bouton « Créer un projet »", async ({ page }) => {
    await setScenario({ session: true, projects: "data", role: "dev" });
    await page.goto("/projects");
    await expect(page.getByRole("table", { name: "Liste des projets" })).toBeVisible();
    await expect(page.getByTestId("create-project-button")).toHaveCount(0);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
test.describe("autorisation et reprise (AC-48-21)", () => {
  test("USER_TOKEN_REQUIRED : « Autoriser Koklo » appelle installation.start avec le compte et mène à l'URL GitHub générée (interceptée)", async ({
    page,
  }) => {
    const reached = await fakeGithub(page);
    await open(page, { specRepo: "tokenRequired" });
    await partial(page, "mon-depot");
    await dialogOf(page).getByRole("button", { name: "Autoriser Koklo sur acme-corp" }).click();
    await expect.poll(() => reached.length).toBe(1);
    expect(reached[0]).toBe(FAKE_GITHUB_URL);
    expect(await githubStartsSeen()).toEqual([{ installationId: ACME_INSTALLATION }]);
    expect(await projectCreatesSeen()).toHaveLength(1);
  });

  test("le marqueur de reprise ne contient aucun secret et la notice « Reprendre » revient après le détour", async ({
    page,
  }) => {
    await fakeGithub(page);
    await open(page, { specRepo: "tokenRequired" });
    await partial(page, "mon-depot");
    await dialogOf(page).getByRole("button", { name: "Autoriser Koklo sur acme-corp" }).click();
    await expect(page).toHaveURL(/github\.com/);
    await page.goBack();
    const marker = await page.evaluate((key) => sessionStorage.getItem(key), MARKER_KEY);
    expect(marker).not.toBeNull();
    expect(marker).not.toMatch(/state=|github\.com|token|secret/i);
    expect(JSON.parse(marker ?? "{}")).toMatchObject({
      projectId: CREATED_PROJECT_ID,
      projectName: NAME,
      installationId: ACME_INSTALLATION,
      repoName: "mon-depot",
    });
  });

  test("retour de GitHub sur /github?result=installed : lien « Reprendre la création du projet », puis notice et reprise réussie", async ({
    page,
  }) => {
    await fakeGithub(page);
    await open(page, { specRepo: "tokenRequired" });
    await partial(page);
    await dialogOf(page).getByRole("button", { name: "Autoriser Koklo sur acme-corp" }).click();
    await expect(page).toHaveURL(/github\.com/);
    await setScenario({
      session: true,
      projects: "data",
      installations: "single",
      specRepo: "ok",
      keepProjects: true,
    });
    await page.goto("/github?result=installed");
    const resume = page.getByRole("link", { name: `Reprendre la création du projet « ${NAME} »` });
    await expect(resume).toHaveAttribute("href", "/projects");
    await resume.click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText(
      `Projet « ${NAME} » : dépôt de spec non créé`,
    );
    await page.getByRole("button", { name: "Reprendre" }).click();
    await expect(dialogOf(page)).toBeVisible();
    await expect(dialogOf(page).getByLabel("Nom du projet")).toHaveCount(0);
  });

  test("« Ignorer » efface la notice et le marqueur", async ({ page }) => {
    await open(page, { specRepo: "unavailable" });
    await partial(page);
    await dialogOf(page).getByRole("button", { name: "Fermer" }).click();
    await page.getByRole("button", { name: "Ignorer" }).click();
    await expect(page.getByRole("button", { name: "Reprendre" })).toHaveCount(0);
    expect(await page.evaluate((key) => sessionStorage.getItem(key), MARKER_KEY)).toBeNull();
    await expect(page.getByTestId("create-project-button")).toBeFocused();
  });
});

// Sous-lot détachable (repo.link) : voir test/project-create-link.test.tsx.
test.describe("relier un dépôt existant (repo.link)", () => {
  test("repo_name_taken : focus sur le nom, puis liaison du dépôt existant", async ({ page }) => {
    await open(page, { specRepo: "nameTaken" });
    await partial(page, "mon-depot");
    await expect(dialogOf(page).getByLabel("Nom du dépôt (facultatif)")).toBeFocused();
    await dialogOf(page).getByRole("button", { name: "Relier un dépôt existant" }).click();
    await expect(dialogOf(page).getByLabel("Nom du dépôt existant")).toHaveValue("mon-depot");
    await dialogOf(page).getByRole("button", { name: "Relier ce dépôt" }).click();
    await expect(dialogOf(page)).toBeHidden();
    await expect(
      page.getByRole("status").filter({ hasText: `Projet « ${NAME} » et dépôt de spec reliés.` }),
    ).toBeVisible();
    expect(await repoLinksSeen()).toEqual([
      {
        projectId: CREATED_PROJECT_ID,
        installationId: ACME_INSTALLATION,
        role: "spec",
        ownerLogin: "acme-corp",
        name: "mon-depot",
      },
    ]);
  });
});

test.describe("responsive et mouvement (§6, §7.1)", () => {
  test("mobile 375 px : panneau en pleine largeur, pas de défilement horizontal, cibles de 44 px, capture", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await open(page, { specRepo: "unavailable" });
    await partial(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    const box = await dialogOf(page).boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(370);
    for (const name of ["Réessayer", "Fermer"]) {
      await expect
        .poll(
          async () =>
            (await dialogOf(page).getByRole("button", { name }).boundingBox())?.height ?? 0,
        )
        .toBeGreaterThanOrEqual(44);
    }
    await capture(page, "create-partial-mobile", "light");
  });

  test("mouvement réduit : aucun élément du panneau n'est animé en continu", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, { installations: "loading" });
    await expect(dialogOf(page)).toContainText("Chargement des comptes GitHub…");
    const animated = await dialogOf(page).evaluate((root) =>
      [...root.querySelectorAll("*")].some((el) => {
        const style = getComputedStyle(el);
        return style.animationName !== "none" && style.animationIterationCount === "infinite";
      }),
    );
    expect(animated).toBe(false);
    await releaseHeld();
  });
});
