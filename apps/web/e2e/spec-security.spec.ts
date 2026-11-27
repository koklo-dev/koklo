import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  AXE_TAGS,
  CAPTURES_DIR,
  type KanbanRole,
  setScenario,
  settle,
  switchToDark,
  type Theme,
} from "./support/helpers.ts";
import { FEATURE_PROJECT_ID } from "./support/stub-features.ts";
import type { ProposalsMode } from "./support/stub-proposals.ts";
import type { SecurityMode } from "./support/stub-spec-security.ts";

/**
 * TK-117 lot C, page Sécurité (design/screens/S-spec-security.md, maquette 15) : chaque état (Prêt, Génération,
 * Relecture, Liste · équipe, Validé, À revoir, Vue client) sur ses onglets, la fiche, les feuilles et la vue client, en
 * clair, sombre et à 375 px, avec axe et sans défilement horizontal de page ; puis les parcours. Pile locale : faux API
 * (support/stub-spec-security.ts). Captures dans
 * design/screens/captures/S-spec-security/<état>[-<onglet>]-<thème>[-mobile].png.
 */
const PATH = `/projects/${FEATURE_PROJECT_ID}/spec/security`;
const VIEWPORTS = [
  { name: "", width: 1440, height: 900 },
  { name: "-mobile", width: 375, height: 800 },
] as const;
const THEMES: Theme[] = ["light", "dark"];
const TABS = ["threats", "data", "rights", "reqs", "summary", "doc"] as const;
type Tab = (typeof TABS)[number];

interface View {
  name: string;
  security: SecurityMode;
  proposals?: ProposalsMode;
  role?: KanbanRole;
  path: string;
  visible: (page: Page) => Promise<void>;
}

const fiche = (page: Page) => page.getByRole("complementary", { name: "Fiche de la menace" });
const threatRow = (page: Page, id: string) => page.getByRole("button", { name: new RegExp(id) });
const shown = (page: Page, text: string | RegExp) =>
  expect(page.getByText(text).first()).toBeVisible();

/** Ce qu'un onglet montre une fois lu. */
const loaded: Record<Tab, (page: Page) => Promise<void>> = {
  threats: async (page) => expect(threatRow(page, "SEC-T08")).toBeVisible(),
  data: async (page) =>
    expect(page.getByRole("table", { name: "Données sensibles" })).toBeVisible(),
  rights: async (page) =>
    expect(page.getByRole("table", { name: "Matrice des droits" })).toBeVisible(),
  reqs: async (page) =>
    expect(page.getByRole("table", { name: "Couverture par chapitre" })).toBeVisible(),
  summary: async (page) =>
    expect(page.getByRole("article", { name: "Où sont les données" })).toBeVisible(),
  doc: async (page) =>
    expect(page.getByRole("heading", { level: 2, name: "Objet et périmètre" })).toBeVisible(),
};

const tabViews = (name: string, security: SecurityMode, tabs: readonly Tab[]): View[] =>
  tabs.map((tab) => ({
    name: `${name}-${tab}`,
    security,
    path: `${PATH}?tab=${tab}`,
    visible: loaded[tab],
  }));

/** État Relecture : chaque onglet montre son contenu écrit sous l'en-tête « à relire ». */
const reviewViews = (tabs: readonly Tab[]): View[] =>
  tabs.map((tab) => ({
    name: `review-${tab}`,
    security: "demo",
    proposals: "security",
    path: `${PATH}?tab=${tab}&view=review`,
    visible: async (page) => {
      await loaded[tab](page);
      await shown(page, /propositions? à relire/);
    },
  }));

const VIEWS: View[] = [
  ...tabViews("list", "demo", TABS),
  ...tabViews("revise", "revise", TABS),
  ...tabViews("validated", "validated", ["threats", "data", "reqs"]),
  {
    name: "ready-threats",
    security: "empty",
    path: PATH,
    visible: (page) => shown(page, "L'agent peut proposer le modèle de menaces"),
  },
  {
    name: "ready-doc",
    security: "empty",
    path: `${PATH}?tab=doc`,
    visible: (page) => shown(page, /Aucune section pour l'instant/),
  },
  {
    name: "generating-threats",
    security: "demo",
    proposals: "generating",
    path: `${PATH}?view=review`,
    visible: (page) => shown(page, /L'agent prépare la sécurité/),
  },
  {
    name: "review-review",
    security: "demo",
    proposals: "security",
    path: `${PATH}?view=review`,
    visible: (page) => expect(page.getByRole("group", { name: "Mode relecture" })).toBeVisible(),
  },
  ...reviewViews(TABS),
  {
    name: "revise-summary-proposal",
    security: "revise",
    proposals: "securitySummary",
    path: `${PATH}?tab=summary`,
    visible: (page) =>
      expect(page.getByRole("group", { name: "Proposition de l'agent" })).toBeVisible(),
  },
  {
    // État à comparer 1 et 2 : menaces et fiche SEC-T08.
    name: "list-fiche",
    security: "demo",
    path: `${PATH}?threat=SEC-T08`,
    visible: async (page) => {
      await expect(fiche(page).getByText(/Aucune parade décidée/)).toBeVisible();
    },
  },
  {
    name: "list-fiche-scenario",
    security: "demo",
    path: `${PATH}?threat=SEC-T01`,
    visible: async (page) => {
      await fiche(page).getByRole("button", { name: "Scénario d'abus" }).click();
      await expect(fiche(page).getByText("Scénario d'abus généré")).toBeVisible();
    },
  },
  {
    name: "sheet-threat",
    security: "demo",
    path: `${PATH}?new=1`,
    visible: async (page) => {
      await expect(page.getByRole("dialog", { name: "Nouvelle menace" })).toBeVisible();
    },
  },
  {
    name: "sheet-sensitive",
    security: "demo",
    path: `${PATH}?tab=data&data=reservations.note&edit=reservations.note`,
    visible: async (page) => {
      await expect(page.getByRole("textbox", { name: /^Champ/ })).toHaveValue("reservations.note");
    },
  },
  {
    name: "list-designer",
    security: "demo",
    role: "designer",
    path: PATH,
    visible: loaded.threats,
  },
  {
    name: "client-summary",
    security: "validated",
    role: "client",
    path: PATH,
    visible: loaded.summary,
  },
  {
    name: "client-question",
    security: "validated",
    role: "client",
    path: PATH,
    visible: async (page) => {
      await page.getByRole("button", { name: "Poser une question" }).click();
      await page.getByRole("button", { name: "Indiquer un contact" }).click();
      await expect(page.getByRole("textbox", { name: /^Téléphone/ })).toBeVisible();
    },
  },
  {
    name: "client-not-validated",
    security: "notValidated",
    role: "client",
    path: PATH,
    visible: (page) => shown(page, /en cours de validation par l'équipe/),
  },
];

const scenario = (view: { security: SecurityMode; proposals?: ProposalsMode; role?: KanbanRole }) =>
  setScenario({
    session: true,
    projects: "data",
    installations: "single",
    security: view.security,
    proposals: view.proposals ?? "none",
    ...(view.role ? { role: view.role } : {}),
  });

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const violationsOf = async (page: Page) => {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return results.violations.map((v) => `${v.id} ${v.nodes.map((n) => n.target).join(" ")}`);
};

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const view of VIEWS) {
      test(`S-spec-security ${view.name} (${theme}${viewport.name}) : état, axe sans violation, capture`, async ({
        page,
      }) => {
        test.setTimeout(90_000);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await scenario(view);
        if (theme === "dark") {
          await page.goto(PATH);
          await switchToDark(page);
        }
        await page.goto(view.path);
        await view.visible(page);
        await expect(page.locator("html")).toHaveClass(
          theme === "dark" ? /dark/ : /^((?!dark).)*$/,
        );
        await settle(page);
        await page.screenshot({
          path: `${CAPTURES_DIR}/S-spec-security/${view.name}-${theme}${viewport.name}.png`,
          fullPage: true,
        });
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
        expect(await violationsOf(page)).toEqual([]);
      });
    }
  }
}

const sheet = (page: Page, name: string) => page.getByRole("dialog", { name });
const status = (page: Page, text: string) =>
  expect(page.getByRole("status").filter({ hasText: text }).first()).toBeAttached();

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de parcours, un test par parcours
test.describe("parcours de la Sécurité", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("parade écrite, donnée décidée puis « Valider »", async ({ page }) => {
    test.setTimeout(120_000);
    await scenario({ security: "demo" });
    await page.goto(PATH);
    const validate = page.getByRole("button", { name: "Valider", exact: true });
    await expect(validate).toBeDisabled();
    await expect(page.getByText(/1 menace élevée sans parade et 1 donnée à classer/)).toBeVisible();
    await fiche(page).getByRole("button", { name: "Proposer une parade" }).click();
    await expect(page.getByRole("dialog").getByRole("textbox")).toHaveValue(
      "Proposer des parades pour SEC-T08",
    );
    await page.keyboard.press("Escape");
    await fiche(page).getByRole("button", { name: "Modifier" }).click();
    const threat = sheet(page, "Modifier la menace");
    await threat.getByRole("textbox", { name: /^Parades/ }).fill("Second facteur à chaque export.");
    await page.keyboard.press("Control+Enter");
    await expect(threat).toBeHidden();
    await status(page, "Menace enregistrée");

    await page.getByRole("link", { name: /Données sensibles/ }).click();
    await page.getByRole("button", { name: "Décider : reservations.note" }).click();
    const data = sheet(page, "Modifier la donnée");
    const retention = data.getByRole("textbox", { name: /^Conservation/ });
    await expect(retention).toBeFocused();
    await retention.fill("1 an après le rendez-vous");
    await data.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(data).toBeHidden();

    await expect(validate).toBeEnabled();
    await validate.click();
    await expect(page.getByText("Validé par l'équipe")).toBeVisible();
    await expect(validate).toBeHidden();
  });

  test("niveau ASVS au clavier, annoncé", async ({ page }) => {
    await scenario({ security: "demo" });
    await page.goto(`${PATH}?tab=reqs`);
    const level = page.getByRole("radio", { name: "Niveau 2 · recommandé" });
    await level.focus();
    await page.keyboard.press("ArrowRight");
    await status(page, "Niveau enregistré");
    await expect(page.getByRole("radio", { name: "Niveau 3" })).toBeChecked();
  });

  test("client : contact enregistré et question envoyée", async ({ page }) => {
    await scenario({ security: "validated", role: "client" });
    await page.goto(PATH);
    await expect(page.getByRole("link", { name: "Résumé", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Indiquer un contact" }).click();
    await page.getByRole("textbox", { name: /^Nom/ }).fill("Marie Exemple");
    await page.getByRole("textbox", { name: /^Téléphone/ }).fill("06 00 00 00 00");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await status(page, "Contact enregistré");
    await expect(page.getByText(/Contact en cas d'incident : Marie Exemple/)).toBeVisible();
    await page.getByRole("button", { name: "Poser une question" }).click();
    await page
      .getByRole("textbox", { name: "Votre question à l'équipe" })
      .fill("Qui voit mes notes ?");
    await page.keyboard.press("Control+Enter");
    await status(page, "Question envoyée à l'équipe");
  });

  test("375 px : liste, fiche puis « Liste »", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await scenario({ security: "demo" });
    await page.goto(PATH);
    await threatRow(page, "SEC-T08").click();
    await expect(fiche(page).getByRole("heading", { level: 2 })).toBeVisible();
    await page.getByRole("button", { name: "Liste", exact: true }).click();
    await expect(threatRow(page, "SEC-T08")).toBeVisible();
  });
});
