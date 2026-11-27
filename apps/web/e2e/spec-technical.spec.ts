import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  AXE_TAGS,
  CAPTURES_DIR,
  type KanbanRole,
  releaseHeld,
  setScenario,
  settle,
  switchToDark,
  type Theme,
} from "./support/helpers.ts";
import { FEATURE_PROJECT_ID } from "./support/stub-features.ts";
import type { ProposalsMode } from "./support/stub-proposals.ts";
import type { TechnicalMode } from "./support/stub-spec-technical.ts";

/**
 * TK-115 lot C, page Technique (design/screens/S-spec-technical.md, maquette 14) : chaque état (Prêt, Génération,
 * Relecture, Liste · équipe, À revoir, Vue client) sur les onglets Stack, Environnements et Document, en clair, sombre
 * et à 375 px, avec axe et sans défilement horizontal de page, plus la fiche, la relecture groupée, les feuilles et la
 * vue client non validée ; puis les parcours. Pile locale : faux API (support/stub-spec-technical.ts). Captures dans
 * design/screens/captures/S-spec-technical/<état>-<onglet>-<thème>[-mobile].png.
 */
const PATH = `/projects/${FEATURE_PROJECT_ID}/spec/technical`;
const VIEWPORTS = [
  { name: "", width: 1440, height: 900 },
  { name: "-mobile", width: 375, height: 800 },
] as const;
const THEMES: Theme[] = ["light", "dark"];
const TABS = ["stack", "environments", "document"] as const;
type Tab = (typeof TABS)[number];

interface View {
  name: string;
  technical: TechnicalMode;
  proposals?: ProposalsMode;
  role?: KanbanRole;
  path: string;
  visible: (page: Page) => Promise<void>;
}

const banner = (page: Page) => page.getByRole("group", { name: "Mode relecture" });
const fiche = (page: Page) => page.getByRole("complementary", { name: "Fiche du choix technique" });
const environments = (page: Page) => page.getByRole("table", { name: "Environnements" });

/** Ce qu'un onglet montre une fois lu. */
const loaded: Record<Tab, (page: Page) => Promise<void>> = {
  stack: async (page) => {
    await expect(page.getByRole("button", { name: /Fournisseur SMS/ })).toBeVisible();
  },
  environments: async (page) => {
    await expect(environments(page)).toBeVisible();
    await expect(page.getByRole("region", { name: "Variables et secrets" })).toBeVisible();
  },
  document: async (page) => {
    await expect(page.getByRole("heading", { level: 2, name: "Objet" })).toBeVisible();
  },
};

const VIEWS: View[] = TABS.flatMap((tab): View[] => [
  {
    name: `ready-${tab}`,
    technical: "empty",
    path: `${PATH}?tab=${tab}`,
    visible: async (page) => {
      await expect(
        tab === "document"
          ? page.getByText(/Aucune section pour l'instant/)
          : page.getByText("L'agent peut proposer le cahier technique"),
      ).toBeVisible();
    },
  },
  {
    name: `generating-${tab}`,
    technical: "demo",
    proposals: "generating",
    path: `${PATH}?tab=${tab}&view=review`,
    visible: async (page) => {
      await expect(page.getByText(/L'agent rédige le cahier technique/)).toBeVisible();
    },
  },
  {
    name: `review-${tab}`,
    technical: "demo",
    proposals: "technical",
    path: `${PATH}?tab=${tab}&view=review`,
    visible: async (page) => {
      await expect(banner(page)).toBeVisible();
      await loaded[tab](page);
    },
  },
  {
    name: `list-${tab}`,
    technical: "demo",
    path: `${PATH}?tab=${tab}`,
    visible: loaded[tab],
  },
  {
    name: `revise-${tab}`,
    technical: "revise",
    path: `${PATH}?tab=${tab}`,
    visible: async (page) => {
      await expect(page.getByRole("alert").filter({ hasText: "a changé" })).toBeVisible();
      await loaded[tab](page);
    },
  },
  {
    name: `client-${tab}`,
    technical: "validated",
    role: "client",
    path: `${PATH}?tab=${tab}`,
    visible: async (page) => {
      await expect(page.getByRole("note").filter({ hasText: "Lecture seule." })).toBeVisible();
      await loaded[tab](page);
    },
  },
]);

VIEWS.push(
  {
    // État à comparer : fiche du choix à trancher (au-dessous de 1280 px et sur téléphone : choix demandé).
    name: "list-stack-fiche",
    technical: "demo",
    path: `${PATH}?tab=stack&sel=ST-sms`,
    visible: async (page) => {
      await expect(fiche(page).getByRole("button", { name: "Choisir Brevo" })).toBeVisible();
    },
  },
  {
    name: "review-grouped",
    technical: "demo",
    proposals: "technical",
    path: `${PATH}?view=review`,
    visible: async (page) => {
      await expect(banner(page)).toBeVisible();
      await expect(page.getByText("Groupées par type")).toBeVisible();
      await expect(page.getByText("Texte proposé")).toBeVisible();
    },
  },
  {
    // Relecture d'un choix proposé : « rôle : option », « pourquoi », « En clair » (maquette 14 l.736, B764).
    name: "review-choice",
    technical: "demo",
    proposals: "technical",
    path: `${PATH}?view=review`,
    visible: async (page) => {
      await page.getByRole("button", { name: /Fournisseur SMS : Brevo/ }).click();
      await expect(
        page.getByRole("heading", { level: 2, name: "Fournisseur SMS : Brevo" }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { level: 3, name: "En clair" })).toBeVisible();
    },
  },
  {
    name: "client-not-validated",
    technical: "notValidated",
    role: "client",
    path: PATH,
    visible: async (page) => {
      await expect(
        page.getByText("Le cahier technique est en cours de validation par l'équipe"),
      ).toBeVisible();
    },
  },
  {
    name: "list-stack-designer",
    technical: "demo",
    role: "designer",
    path: PATH,
    visible: loaded.stack,
  },
  {
    name: "sheet-stack",
    technical: "demo",
    path: `${PATH}?new=1`,
    visible: async (page) => {
      await expect(page.getByRole("dialog", { name: "Nouveau choix technique" })).toBeVisible();
    },
  },
  {
    name: "sheet-environment",
    technical: "demo",
    path: `${PATH}?tab=environments&edit=ENV-recette`,
    visible: async (page) => {
      await expect(page.getByRole("textbox", { name: /^Adresse/ })).toHaveValue(
        "recette.atelier-lumiere.fr",
      );
    },
  },
);

const scenario = (view: {
  technical: TechnicalMode;
  proposals?: ProposalsMode;
  role?: KanbanRole;
}) =>
  setScenario({
    session: true,
    projects: "data",
    installations: "single",
    technical: view.technical,
    proposals: view.proposals ?? "none",
    ...(view.role ? { role: view.role } : {}),
  });

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const view of VIEWS) {
      test(`S-spec-technical ${view.name} (${theme}${viewport.name}) : état, axe sans violation, capture`, async ({
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
          path: `${CAPTURES_DIR}/S-spec-technical/${view.name}-${theme}${viewport.name}.png`,
          fullPage: true,
        });
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
        const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(results.violations, JSON.stringify(results.violations.map((v) => v.id))).toEqual([]);
        await releaseHeld();
      });
    }
  }
}

const start = async (
  page: Page,
  over: { technical?: TechnicalMode; proposals?: ProposalsMode; role?: KanbanRole } = {},
  width = 1440,
) => {
  await page.setViewportSize({ width, height: 900 });
  await scenario({ ...over, technical: over.technical ?? "demo" });
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
test.describe("parcours de la page Technique", () => {
  test("en-tête : résumé, onglets Stack, Environnements et Document, jamais « Valider »", async ({
    page,
  }) => {
    await start(page);
    await page.goto(PATH);
    await expect(page.getByRole("heading", { level: 1, name: "Cahier technique" })).toBeVisible();
    await expect(
      page.getByText(
        "24 choix · 132 opérations · 28 exigences · 3 environnements · 2 choix à trancher avant de valider",
      ),
    ).toBeVisible();
    const tabs = page.getByRole("navigation", { name: "Sections du cahier technique" });
    await expect(tabs.getByRole("link")).toHaveText([/^Stack/, /^Environnements/, "Document"]);
    await expect(page.getByRole("button", { name: "Nouveau choix" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Valider/ })).toHaveCount(0);
  });

  test("Stack : deux cartes par ligne dès 1024 px, fiche, tableau, YAML", async ({ page }) => {
    await start(page);
    await page.goto(PATH);
    const cards = page.getByRole("region", { name: /^Services et API/ }).getByRole("button");
    await expect(cards.first()).toBeVisible();
    const [first, second] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
    expect(first?.y).toBe(second?.y);
    await expect(fiche(page).getByRole("table", { name: "Options comparées" })).toBeVisible();
    await expect(fiche(page).getByText("≈ : estimations à vérifier")).toBeVisible();
    await fiche(page).getByRole("button", { name: "YAML" }).click();
    await expect(fiche(page).getByText("Source de vérité")).toBeVisible();
    await expect(fiche(page).getByRole("region", { name: "YAML du choix" })).toContainText(
      "id: ST-",
    );
  });

  test("« Choisir » enregistre aussitôt : annonce et statut « Choisi »", async ({ page }) => {
    await start(page);
    await page.goto(`${PATH}?sel=ST-sms`);
    await fiche(page).getByRole("button", { name: "Choisir Brevo" }).click();
    await expect(page.getByText("Choix enregistré").first()).toBeAttached();
    await expect(fiche(page).getByRole("button", { name: /^Choisir/ })).toHaveCount(0);
    await expect(page.getByText("· 1 à trancher")).toBeVisible();
  });

  test("sous 1280 px la fiche s'ouvre en panneau ; Échap rend le focus à la carte", async ({
    page,
  }) => {
    await start(page, {}, 1100);
    await page.goto(PATH);
    const card = page.getByRole("button", { name: /Fournisseur e-mail/ });
    await expect(card).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await card.click();
    await expect(page.getByRole("dialog", { name: "Fiche du choix technique" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(card).toBeFocused();
  });

  test("375 px : liste puis fiche, « Liste » pour revenir", async ({ page }) => {
    await start(page, {}, 375);
    await page.goto(PATH);
    await page.getByRole("button", { name: /Fournisseur e-mail/ }).click();
    await expect(fiche(page)).toBeVisible();
    await expect(page.getByRole("button", { name: /Fournisseur SMS/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Liste" }).click();
    await expect(page.getByRole("button", { name: /Fournisseur SMS/ })).toBeVisible();
  });

  test("recherche par le serveur, sans résultat puis effacée", async ({ page }) => {
    await start(page);
    await page.goto(`${PATH}?q=zzz`);
    await expect(page.getByText("Aucun choix ne correspond à « zzz »")).toBeVisible();
    await page.getByRole("button", { name: "Effacer la recherche" }).click();
    await expect(page.getByRole("button", { name: /Fournisseur SMS/ })).toBeVisible();
  });

  test("feuilles : erreurs avec focus, Échap, modification d'un environnement par le menu", async ({
    page,
  }) => {
    await start(page);
    await page.goto(PATH);
    const create = page.getByRole("button", { name: "Nouveau choix" });
    await create.click();
    const dialog = page.getByRole("dialog", { name: "Nouveau choix technique" });
    await dialog.getByRole("button", { name: "Enregistrer dans la spec" }).click();
    await expect(dialog.getByText(/6 points à corriger/)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(create).toBeFocused();
    await page.goto(`${PATH}?tab=environments`);
    await page.getByRole("button", { name: "Modifier" }).click();
    await page.getByRole("menuitem", { name: "Recette" }).click();
    await expect(page).toHaveURL(/edit=ENV-recette/);
    await expect(page.getByRole("dialog", { name: "Modifier l'environnement" })).toBeVisible();
  });

  test("relecture : onglet devant, filtres et « Quitter la relecture »", async ({ page }) => {
    await start(page, { proposals: "technical" });
    await page.goto(`${PATH}?view=review`);
    await expect(banner(page)).toContainText("l'agent propose 36 éléments depuis l'architecture");
    for (const label of ["Document · cahier technique", "Stack", "Opérations de l'API"]) {
      await expect(
        page.getByRole("button", { name: new RegExp(`^${label}`) }).first(),
      ).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /^Toutes · 36/ })).toBeVisible();
    await page.getByRole("button", { name: "Quitter la relecture" }).click();
    await expect(page).not.toHaveURL(/view=review/);
  });

  test("client : « En clair », sans YAML, « Commenter » le choix ouvert", async ({ page }) => {
    await start(page, { technical: "validated", role: "client" });
    await page.goto(`${PATH}?sel=ST-sms`);
    await expect(fiche(page)).toContainText(
      "Le prestataire qui enverra les rappels SMS reste à choisir.",
    );
    await expect(page.getByRole("button", { name: /YAML|Modifier|^Choisir/ })).toHaveCount(0);
    await fiche(page).getByRole("button", { name: "Commenter" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("Quel coût ?");
    await dialog.getByRole("button", { name: "Envoyer" }).click();
    await expect(page.getByText("Commentaire envoyé").first()).toBeAttached();
  });
});
