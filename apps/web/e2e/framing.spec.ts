import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  AXE_TAGS,
  aiCallsSeen,
  CAPTURES_DIR,
  type KanbanRole,
  releaseHeld,
  setScenario,
  settle,
  specWritesSeen,
  switchToDark,
  type Theme,
} from "./support/helpers.ts";
import { type AiMode, HOSTILE_TEXT } from "./support/stub-ai.ts";
import type { WriteMode } from "./support/stub-feature-write.ts";
import { FEATURE_PROJECT_ID, UNKNOWN_PROJECT_ID } from "./support/stub-features.ts";

/**
 * TK-59 / 59a et 59b, cadrage assisté (design/screens/S-framing.md §11). Pile locale : faux API avec modèle simulé
 * (support/stub-ai.ts) et écriture simulée (support/stub-feature-write.ts), navigateur réel ; jamais Anthropic,
 * github.com ni Postgres. Captures : design/screens/captures/S-framing/<état>-<thème>.png (+ -mobile à 375 px) ;
 * le Red n'en écrit aucune, le Green/Refactor les génère.
 */
const PATH = `/projects/${FEATURE_PROJECT_ID}/framing`;
const FEATURES_PATH = `/projects/${FEATURE_PROJECT_ID}/spec/functional`;
const IDEA = "Un portail pour réserver des créneaux en ligne.";
const T1 = "Réserver un créneau";
const T2 = "Annuler une réservation";
const T3 = "Rappel par SMS";
const NOT_CONFIGURED = "L'IA n'est pas encore configurée pour votre organisation.";

async function scenario(
  options: { ai?: AiMode; write?: WriteMode; role?: KanbanRole; spec?: "building" } = {},
) {
  await setScenario({
    session: true,
    projects: "data",
    ...(options.ai ? { ai: options.ai } : {}),
    ...(options.write ? { write: options.write } : {}),
    ...(options.role ? { role: options.role } : {}),
    ...(options.spec ? { spec: options.spec } : {}),
  });
}

const cardOf = (page: Page, title: string): Locator =>
  page.getByRole("heading", { name: title, level: 3 }).locator("xpath=ancestor::li[1]");
const generate = (page: Page) => page.getByRole("button", { name: "Générer un brief avec l'IA" });
const propose = (page: Page) =>
  page.getByRole("button", { name: "Proposer des fonctionnalités avec l'IA" });

async function writeIdea(page: Page, idea = IDEA): Promise<void> {
  await page.getByRole("textbox", { name: /^Votre idée/ }).fill(idea);
}
async function toBrief(page: Page): Promise<void> {
  await writeIdea(page);
  await generate(page).click();
  await expect(page.getByRole("heading", { name: /^2\. Le brief/, level: 2 })).toBeFocused();
}
async function toProposals(page: Page): Promise<void> {
  await toBrief(page);
  await propose(page).click();
  await expect(
    page.getByRole("heading", { name: /^3\. Les propositions/, level: 2 }),
  ).toBeFocused();
}
async function capture(page: Page, name: string, theme: Theme, suffix = ""): Promise<void> {
  await settle(page);
  await page.screenshot({
    path: `${CAPTURES_DIR}/S-framing/${name}-${theme}${suffix}.png`,
    fullPage: true,
  });
}
const submitsSeen = async () => (await specWritesSeen()).filter((entry) => entry.kind === "submit");

interface State {
  name: string;
  ai?: AiMode;
  spec?: "building";
  /** Amène l'écran à l'état à capturer. */
  reach: (page: Page) => Promise<void>;
  visible: (page: Page) => Promise<void>;
}
const alertWith = (text: string | RegExp) => (page: Page) =>
  expect(page.getByRole("alert").filter({ hasText: text })).toBeVisible();
const failAt = (reach: (page: Page) => Promise<void>) => async (page: Page) => {
  await writeIdea(page);
  await generate(page).click();
  void reach;
};

const STATES: State[] = [
  {
    name: "idea-empty",
    reach: async () => undefined,
    visible: (page) => expect(page.getByText("Écrivez votre idée pour continuer.")).toBeVisible(),
  },
  {
    name: "idea-policy",
    // TK-87 (S-framing §3.2 v2, B15) : bloc d'envoi en InlineAlert neutre, « Détails » déplié pour la capture.
    reach: async (page) => {
      await writeIdea(page);
      await page.getByRole("button", { name: "Détails" }).first().click();
    },
    visible: async (page) => {
      await expect(
        page
          .getByText("Votre texte est envoyé à l'agent IA avec la clé de l'organisation.")
          .first(),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Détails" }).first()).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(page.locator("body")).not.toContainText(/Anthropic|États-Unis/);
    },
  },
  {
    name: "loading",
    ai: "hold",
    reach: failAt(async () => undefined),
    visible: (page) =>
      expect(page.getByRole("button", { name: "Annuler l'attente" })).toBeVisible(),
  },
  {
    name: "brief",
    reach: toBrief,
    visible: (page) =>
      expect(page.getByRole("button", { name: "Répondre aux questions" })).toBeVisible(),
  },
  {
    name: "proposals",
    reach: toProposals,
    visible: (page) =>
      expect(cardOf(page, T3).getByText("Titre déjà présent : F-003")).toBeVisible(),
  },
  {
    name: "proposals-mixed",
    reach: async (page) => {
      await toProposals(page);
      await cardOf(page, T1).getByRole("button", { name: "Accepter" }).click();
      await cardOf(page, T2).getByRole("button", { name: "Rejeter" }).click();
      await cardOf(page, T1).getByRole("button", { name: "2 critères d'acceptation" }).click();
    },
    visible: (page) => expect(cardOf(page, T2).getByText("Rejetée")).toBeVisible(),
  },
  {
    name: "proposal-edit",
    reach: async (page) => {
      await toProposals(page);
      await cardOf(page, T1).getByRole("button", { name: "Modifier" }).click();
    },
    visible: (page) =>
      expect(
        cardOf(page, T1).getByRole("button", { name: "Terminer la modification" }),
      ).toBeVisible(),
  },
  {
    name: "confirm",
    reach: async (page) => {
      await toProposals(page);
      await cardOf(page, T1).getByRole("button", { name: "Accepter" }).click();
      await page.getByRole("button", { name: /^Enregistrer 1 fonctionnalité$/ }).click();
    },
    visible: (page) =>
      expect(page.getByRole("group", { name: "Confirmer l'enregistrement" })).toBeVisible(),
  },
  {
    name: "saved",
    reach: async (page) => {
      await toProposals(page);
      await cardOf(page, T1).getByRole("button", { name: "Accepter" }).click();
      await page.getByRole("button", { name: /^Enregistrer 1 fonctionnalité$/ }).click();
      await page.getByRole("button", { name: "Confirmer" }).click();
    },
    visible: (page) => expect(page.getByRole("status")).toContainText("1 fonctionnalité créée."),
  },
  {
    name: "empty",
    ai: "empty",
    reach: toProposals,
    visible: (page) =>
      expect(page.getByText("L'IA n'a proposé aucune fonctionnalité nouvelle.")).toBeVisible(),
  },
  {
    name: "duplicates",
    ai: "duplicates",
    reach: toProposals,
    visible: (page) =>
      expect(
        page.getByRole("note").filter({
          hasText: "Toutes ces propositions ressemblent à des fonctionnalités existantes.",
        }),
      ).toBeVisible(),
  },
  {
    name: "not-configured",
    ai: "notConfigured",
    reach: failAt(async () => undefined),
    visible: alertWith(NOT_CONFIGURED),
  },
  {
    name: "invalidated",
    ai: "invalidated",
    reach: failAt(async () => undefined),
    visible: alertWith("La clé enregistrée a été refusée"),
  },
  {
    name: "undecryptable",
    ai: "undecryptable",
    reach: failAt(async () => undefined),
    visible: alertWith("La clé enregistrée est illisible"),
  },
  {
    name: "rate-limited",
    ai: "rateLimited",
    reach: failAt(async () => undefined),
    visible: alertWith(/Trop de demandes pour le moment\. Réessayez dans \d+ s\./),
  },
  {
    name: "quota",
    ai: "quota",
    reach: failAt(async () => undefined),
    visible: alertWith("Le crédit du compte du fournisseur est épuisé"),
  },
  {
    name: "provider-error",
    ai: "providerError",
    reach: failAt(async () => undefined),
    visible: alertWith("Le fournisseur n'a pas répondu à temps."),
  },
  {
    name: "output-invalid",
    ai: "outputInvalid",
    reach: failAt(async () => undefined),
    visible: alertWith("Le modèle a renvoyé une réponse inutilisable"),
  },
  {
    name: "prompt-rejected",
    ai: "promptRejected",
    reach: failAt(async () => undefined),
    visible: alertWith("Votre texte contient une séquence réservée"),
  },
  {
    name: "spec-not-ready",
    spec: "building",
    reach: async () => undefined,
    visible: (page) => expect(page.getByText(/La spec du projet n'est pas prête/)).toBeVisible(),
  },
];

async function arrive(page: Page, state: State, theme: Theme): Promise<void> {
  await scenario({
    ...(state.ai ? { ai: state.ai } : {}),
    ...(state.spec ? { spec: state.spec } : {}),
  });
  await page.goto(PATH);
  if (theme === "dark") await switchToDark(page);
  await expect(page.getByRole("heading", { name: "Assistant de cadrage", level: 1 })).toBeVisible();
  await state.reach(page);
  await state.visible(page);
}

for (const theme of ["light", "dark"] as Theme[]) {
  for (const state of STATES) {
    test(`S-framing ${state.name} (${theme}) : état visible, axe sans violation, capture`, async ({
      page,
    }) => {
      await arrive(page, state, theme);
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^((?!dark).)*$/);
      await capture(page, state.name, theme);
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations, JSON.stringify(results.violations.map((v) => v.id))).toEqual([]);
      await releaseHeld();
    });
  }
}

test.describe("375 px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const theme of ["light", "dark"] as Theme[]) {
    for (const name of ["idea-policy", "proposals-mixed", "confirm", "rate-limited"]) {
      test(`S-framing ${name} (${theme}, mobile) : aucun défilement horizontal, cibles de 44 px, axe, capture`, async ({
        page,
      }) => {
        const state = STATES.find((candidate) => candidate.name === name) as State;
        await arrive(page, state, theme);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        for (const button of await page
          .getByRole("button", { name: /Accepter|Rejeter|Modifier|Générer|Confirmer|Enregistrer/ })
          .all()) {
          if (!(await button.isVisible())) continue;
          const box = await button.boundingBox();
          expect(box?.height ?? 44, "cible trop petite").toBeGreaterThanOrEqual(43.5);
        }
        await capture(page, name, theme, "-mobile");
        const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(results.violations).toEqual([]);
        await releaseHeld();
      });
    }
  }
});

test.describe("mouvement réduit", () => {
  test.use({ reducedMotion: "reduce" });
  test("S-framing : aucune animation en cours en attente d'appel", async ({ page }) => {
    await scenario({ ai: "hold" });
    await page.goto(PATH);
    await writeIdea(page);
    await generate(page).click();
    await expect(page.getByRole("button", { name: "Annuler l'attente" })).toBeVisible();
    const running = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter(
            (a) =>
              a.playState === "running" &&
              a.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
          ).length,
    );
    expect(running).toBe(0);
    await releaseHeld();
  });
});

test("S-framing : parcours complet idée -> brief -> propositions -> accepter, rejeter, modifier -> confirmer -> liste", async ({
  page,
}) => {
  await scenario({ ai: "ok", write: "ok" });
  await page.goto(PATH);
  await toProposals(page);
  expect(await submitsSeen()).toHaveLength(0);
  await cardOf(page, T1).getByRole("button", { name: "Accepter" }).click();
  await cardOf(page, T3).getByRole("button", { name: "Rejeter" }).click();
  await cardOf(page, T2).getByRole("button", { name: "Modifier" }).click();
  await cardOf(page, T2)
    .getByRole("textbox", { name: /^Titre( \(obligatoire\))?$/ })
    .fill("Annuler (édité)");
  await cardOf(page, T2).getByRole("button", { name: "Terminer la modification" }).click();
  await cardOf(page, "Annuler (édité)").getByRole("button", { name: "Accepter" }).click();
  await page.getByRole("button", { name: "Enregistrer 2 fonctionnalités" }).click();
  expect(await submitsSeen()).toHaveLength(0);
  await expect(page.getByRole("button", { name: "Revenir", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByRole("status")).toContainText("2 fonctionnalités créées.");
  const submits = await submitsSeen();
  expect(submits).toHaveLength(1);
  expect((submits[0]?.operations ?? []).map((op) => op.title)).toEqual([T1, "Annuler (édité)"]);
  await page.getByRole("link", { name: "Voir la liste" }).click();
  await expect(page).toHaveURL(new RegExp(`${FEATURES_PATH}\\?tab=features$`));
  await expect(page.getByRole("link", { name: T1 })).toBeVisible();
  const calls = await aiCallsSeen();
  expect(calls.map((call) => call.kind)).toEqual(["brief", "features"]);
});

test("S-framing : un brief collé saute draftBrief (« J'ai déjà un brief »)", async ({ page }) => {
  await scenario({ ai: "ok" });
  await page.goto(PATH);
  await page.getByRole("tab", { name: "J'ai déjà un brief" }).click();
  await page
    .getByRole("textbox", { name: /^Votre brief/ })
    .fill("Titre : Portail\nProblème : réserver est long.");
  await page.getByRole("button", { name: "Relire le brief" }).click();
  await propose(page).click();
  await expect(cardOf(page, T1)).toBeVisible();
  expect((await aiCallsSeen()).map((call) => call.kind)).toEqual(["features"]);
});

for (const role of ["client", "business"] as KanbanRole[]) {
  test(`S-framing : ${role} n'a ni bouton ni formulaire, et aucun appel ai.* ni écriture`, async ({
    page,
  }) => {
    await scenario({ role });
    await page.goto(FEATURES_PATH);
    await expect(page.getByRole("heading", { name: "Cahier fonctionnel", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cadrer avec l'IA" })).toHaveCount(0);
    await page.goto(PATH);
    await expect(
      page.getByRole("heading", {
        name: "Le cadrage assisté n'est pas disponible pour votre rôle.",
      }),
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    expect(await aiCallsSeen()).toEqual([]);
    expect(await submitsSeen()).toEqual([]);
  });
}

test("S-framing : le lien « Cadrer avec l'IA » a quitté la liste (TK-99b), la route reste ouverte", async ({
  page,
}) => {
  await scenario({ role: "dev" });
  await page.goto(FEATURES_PATH);
  await expect(page.getByRole("button", { name: /Proposer avec l'agent/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Cadrer avec l'IA" })).toHaveCount(0);
  await page.goto(PATH);
  await expect(page.getByRole("heading", { name: "Assistant de cadrage", level: 1 })).toBeVisible();
});

test("S-framing : designer, enregistrement impossible sans écran lié (message permanent)", async ({
  page,
}) => {
  await scenario({ role: "designer" });
  await page.goto(PATH);
  await toProposals(page);
  await cardOf(page, T1).getByRole("button", { name: "Accepter" }).click();
  await expect(
    page.getByText(
      /En tant que designer, vous ne pouvez enregistrer qu'une fonctionnalité liée à un écran/,
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Enregistrer \d/ })).toHaveCount(0);
  expect(await submitsSeen()).toEqual([]);
});

test("S-framing : texte hostile rendu littéralement, aucun lien ni script issu du modèle", async ({
  page,
}) => {
  await scenario({ ai: "hostile" });
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => void dialogs.push(dialog.message()));
  await page.goto(PATH);
  await toProposals(page);
  const hostile = cardOf(page, `Titre ${HOSTILE_TEXT}`);
  await expect(hostile).toContainText(HOSTILE_TEXT);
  expect(await page.locator("main script, main img, main iframe").count()).toBe(0);
  const hrefs = await page
    .locator("main a[href]")
    .evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  for (const href of hrefs)
    expect(href).toMatch(
      /^\/projects(\/[0-9a-f-]{36}(\/(spec\/functional|framing))?(\?tab=features(&sel=F-\d{3})?)?)?$/,
    );
  expect(
    await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
  ).toBeUndefined();
  expect(dialogs).toEqual([]);
});

test("S-framing : annuler l'attente garde la saisie et dit que la demande est comptée", async ({
  page,
}) => {
  await scenario({ ai: "hold" });
  await page.goto(PATH);
  await writeIdea(page);
  await generate(page).click();
  await expect(page.getByRole("button", { name: "Génération en cours…" })).toBeDisabled();
  await page.getByRole("button", { name: "Annuler l'attente" }).click();
  await expect(page.getByText("La demande a déjà été comptée.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Votre idée/ })).toHaveValue(IDEA);
  await releaseHeld();
  await expect(page.getByRole("heading", { name: /^2\. Le brief/ })).toHaveCount(0);
});

test("S-framing : limite atteinte, compte à rebours, saisie conservée", async ({ page }) => {
  await scenario({ ai: "rateLimited" });
  await page.goto(PATH);
  await writeIdea(page);
  await generate(page).click();
  await expect(page.locator("#framing-error")).toContainText(/Réessayez dans (30|29|28) s\./);
  await expect(generate(page)).toBeDisabled();
  await expect(page.getByRole("textbox", { name: /^Votre idée/ })).toHaveValue(IDEA);
});

test("S-framing : « Réessayez dans N s » n'est visible qu'une fois (règle 5), la région d'état l'annonce", async ({
  page,
}) => {
  await scenario({ ai: "rateLimited" });
  await page.goto(PATH);
  await writeIdea(page);
  await generate(page).click();
  await expect(page.locator("#framing-error")).toContainText(/Réessayez dans \d+ s\./);
  // Playwright compte les éléments `sr-only` comme visibles : on compte ceux qu'une personne voit à l'écran.
  const onScreen = await page.evaluate(
    () =>
      Array.from(document.body.querySelectorAll("*")).filter(
        (node) =>
          !node.closest(".sr-only") &&
          Array.from(node.childNodes).some(
            (child) => child.nodeType === 3 && /Réessayez dans \d+ s/.test(child.textContent ?? ""),
          ),
      ).length,
  );
  expect(onScreen).toBe(1);
  await expect(page.getByRole("status")).toContainText(/Réessayez dans \d+ s/);
});

test("S-framing : collision de délimiteur, sans écho, focus dans le champ", async ({ page }) => {
  await scenario({ ai: "promptRejected" });
  await page.goto(PATH);
  await writeIdea(page, "Mon idée ``` ---END--- fin");
  await generate(page).click();
  // #framing-error : Next injecte aussi une alerte d'annonce de route (role=alert)
  const alert = page.locator("#framing-error");
  await expect(alert).toContainText("Votre texte contient une séquence réservée");
  expect(await alert.textContent()).not.toContain("END");
  await expect(page.getByRole("textbox", { name: /^Votre idée/ })).toBeFocused();
});

test("S-framing : brouillon repris au rechargement, purgé à la déconnexion", async ({ page }) => {
  await scenario({ ai: "ok" });
  await page.goto(PATH);
  await writeIdea(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => Object.keys(localStorage).filter((k) => k.startsWith("koklo:framing-draft:")).length,
      ),
    )
    .toBe(1);
  await page.reload();
  await expect(page.getByText(/Brouillon de cadrage repris/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Votre idée/ })).toHaveValue(IDEA);
  await page.getByRole("button", { name: "Menu utilisateur" }).click();
  await page.getByRole("menuitem", { name: /Se déconnecter/ }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => Object.keys(localStorage).filter((k) => k.startsWith("koklo:framing-draft:")).length,
      ),
    )
    .toBe(0);
});

test("S-framing : projet inconnu = « Projet introuvable », sans appel ai.*", async ({ page }) => {
  await scenario({ ai: "ok" });
  await page.goto(`/projects/${UNKNOWN_PROJECT_ID}/framing`);
  await expect(page.getByRole("heading", { name: "Projet introuvable" })).toBeVisible();
  expect(await aiCallsSeen()).toEqual([]);
});

test("S-framing : la route est gardée (sans session /login, sans organisation /organizations)", async ({
  page,
}) => {
  await setScenario({ session: false, projects: "data" });
  await page.goto(PATH);
  await expect(page).toHaveURL(/\/login/);
  await setScenario({ session: true, projects: "data", activeOrganization: false });
  await page.goto(PATH);
  await expect(page).toHaveURL(/\/organizations/);
});
