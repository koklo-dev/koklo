import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  AXE_TAGS,
  CAPTURES_DIR,
  type KanbanRole,
  layoutSavesSeen,
  releaseHeld,
  setScenario,
  settle,
  specWritesSeen,
  switchToDark,
  type Theme,
} from "./support/helpers.ts";
import { FEATURE_PROJECT_ID, type SpecMode } from "./support/stub-features.ts";
import type { ProposalsMode } from "./support/stub-proposals.ts";

/**
 * TK-107 lot C et TK-108 lot C, écran Données (design/screens/S-spec-data.md v3, maquette 11) : chaque état (Prêt, Génération, Relecture,
 * Liste · équipe) sur les onglets Tables et Jeux d'exemple, plus Diagramme, Relecture, volume de 80 tables, recherche
 * vide, formulaire et droits, en clair, sombre et à 375 px, avec axe et sans défilement horizontal de page. Pile locale :
 * faux API (support/stub-spec-data.ts). Captures dans design/screens/captures/S-spec-data/<état>-<onglet>-<thème>[-mobile].png.
 */
const PATH = `/projects/${FEATURE_PROJECT_ID}/spec/data`;
const VIEWPORTS = [
  { name: "", width: 1280, height: 800 },
  { name: "-mobile", width: 375, height: 800 },
] as const;
const THEMES: Theme[] = ["light", "dark"];

interface View {
  name: string;
  spec?: SpecMode;
  proposals?: ProposalsMode;
  role?: KanbanRole;
  path: string;
  visible: (page: Page) => Promise<void>;
  /** Au plus une région `role=status` dans le document (une région vide est masquée, jamais doublée). */
  singleStatus?: boolean;
  /** Geste après l'état visible (sélection d'une table, vue YAML, zoom) : la capture le montre. */
  act?: (page: Page) => Promise<void>;
  /** Ré-affirmé juste avant la capture, après stabilisation de la page. */
  settled?: (page: Page) => Promise<void>;
  /** Capture du bureau seulement (vues YAML, Mermaid et zooms). */
  desktopOnly?: boolean;
}

const tablesLoaded = async (page: Page, rows: number) => {
  await expect(page.getByRole("table", { name: "Tables du modèle de données" })).toBeVisible();
  await expect(page.locator("tbody tr[data-spec-id]")).toHaveCount(rows);
};
const fixtureLoaded = async (page: Page) => {
  await expect(page.getByRole("region", { name: "Jeu d'exemple Clients" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Lignes du jeu Clients" })).toBeVisible();
};
const diagramLoaded = async (page: Page, cards: number) => {
  await expect(page.getByRole("region", { name: "Diagramme entité-relation" })).toBeVisible();
  await expect(page.locator("[data-slot='er-table-card']")).toHaveCount(cards);
};
const card = (page: Page, name: string) =>
  page.getByRole("button", { name: new RegExp(`^Table ${name},`) });
const fiche = (page: Page) =>
  page
    .getByRole("complementary", { name: "Fiche de la table" })
    .or(page.getByRole("dialog", { name: "Fiche de la table" }));
const pick = async (page: Page, name: string) => {
  await card(page, name).click();
  await expect(fiche(page).getByRole("heading", { level: 2, name })).toBeVisible();
};
const zoom = async (page: Page, label: "Zoomer" | "Dézoomer", times: number) => {
  for (let i = 0; i < times; i += 1)
    await page.getByRole("button", { name: label, exact: true }).click();
};
const ready = async (page: Page) => {
  await expect(page.getByText("L'agent peut proposer le modèle de données")).toBeVisible();
  await expect(page.getByText(/7 fonctionnalités, 4 règles, 3 rôles, 2 parcours/)).toBeVisible();
};
const generating = async (page: Page) => {
  await expect(page.getByText(/L'agent déduit les tables et les relations/)).toBeVisible();
  await expect(page.locator("[data-slot='data-generating'] [data-slot='skeleton']")).toHaveCount(6);
};
const reviewing = async (page: Page) => {
  await expect(page.getByText("Table · 3 champs · ← F-001, F-003")).toBeVisible();
  await expect(page.getByRole("table", { name: "Champs de la table" })).toBeVisible();
};

const VIEWS: View[] = [
  ...(["tables", "fixtures"] as const).flatMap((tab): View[] => [
    {
      name: `ready-${tab}`,
      spec: "dataEmpty",
      path: `${PATH}?tab=${tab}`,
      singleStatus: true,
      visible: ready,
    },
    {
      name: `generating-${tab}`,
      proposals: "generating",
      path: `${PATH}?tab=${tab}&view=review`,
      singleStatus: true,
      visible: generating,
    },
    {
      name: `review-${tab}`,
      spec: "dataEmpty",
      proposals: "data",
      path: `${PATH}?tab=${tab}&view=review`,
      visible: async (page) => {
        await expect(page.getByRole("group", { name: "Mode relecture" })).toBeVisible();
        if (tab === "tables") await tablesLoaded(page, 6);
        else
          await expect(
            page.getByRole("region", { name: "Jeu proposé Clients", exact: true }),
          ).toBeVisible();
      },
    },
    {
      name: `list-${tab}`,
      path: `${PATH}?tab=${tab}`,
      singleStatus: true,
      visible: async (page) => {
        if (tab === "tables") await tablesLoaded(page, 6);
        else await fixtureLoaded(page);
      },
    },
  ]),
  {
    name: "list-diagram",
    path: `${PATH}?tab=diagram`,
    visible: (page) => diagramLoaded(page, 6),
  },
  {
    name: "list-diagram-fiche",
    path: `${PATH}?tab=diagram`,
    visible: (page) => diagramLoaded(page, 6),
    act: (page) => pick(page, "Réservation"),
    // La fiche doit toujours être là au moment de la capture (la sélection vit dans l'adresse).
    settled: (page) =>
      expect(fiche(page).getByRole("heading", { level: 2, name: "Réservation" })).toBeVisible(),
  },
  {
    name: "list-diagram-yaml",
    path: `${PATH}?tab=diagram`,
    desktopOnly: true,
    visible: (page) => diagramLoaded(page, 6),
    act: async (page) => {
      await pick(page, "Réservation");
      await fiche(page).getByRole("button", { name: "YAML" }).click();
      await expect(fiche(page).getByText("Source de vérité")).toBeVisible();
    },
  },
  {
    name: "list-diagram-mermaid",
    path: `${PATH}?tab=diagram`,
    desktopOnly: true,
    visible: (page) => diagramLoaded(page, 6),
    act: async (page) => {
      await pick(page, "Réservation");
      await fiche(page).getByRole("button", { name: "Mermaid" }).click();
      await expect(fiche(page).getByText("data/model.mmd")).toBeVisible();
    },
  },
  {
    name: "list-diagram-zoom-50",
    path: `${PATH}?tab=diagram`,
    desktopOnly: true,
    visible: (page) => diagramLoaded(page, 6),
    act: async (page) => {
      await zoom(page, "Dézoomer", 4);
      await expect(page.getByText(/Zoom sous 60 %/)).toBeVisible();
    },
  },
  {
    name: "list-diagram-zoom-200",
    path: `${PATH}?tab=diagram`,
    desktopOnly: true,
    visible: (page) => diagramLoaded(page, 6),
    act: async (page) => {
      await zoom(page, "Zoomer", 4);
      await expect(page.getByRole("button", { name: "200 %, revenir à 100 %" })).toBeVisible();
    },
  },
  {
    name: "review-diagram",
    spec: "dataEmpty",
    proposals: "data",
    path: `${PATH}?tab=diagram&view=review`,
    visible: async (page) => {
      await diagramLoaded(page, 6);
      await expect(page.getByText("Pointillés : proposition à relire")).toBeVisible();
    },
  },
  {
    name: "review-diagram-rejected",
    spec: "dataEmpty",
    proposals: "data",
    path: `${PATH}?tab=diagram&view=review`,
    visible: (page) => diagramLoaded(page, 6),
    act: async (page) => {
      // Les décisions se prennent dans l'onglet Relecture : rejeter « Client », puis revenir au diagramme.
      await page.getByRole("link", { name: /^Relecture/ }).click();
      await expect(page.getByRole("region", { name: "Diagramme entité-relation" })).toHaveCount(0);
      await page
        .getByRole("button", { name: /Client/ })
        .first()
        .click();
      await page.getByRole("button", { name: /^Rejeter/ }).click();
      await page.getByRole("link", { name: /^Diagramme/ }).click();
      await diagramLoaded(page, 6);
      await expect(page.getByText("Rejetée").first()).toBeVisible();
    },
  },
  {
    name: "review-review",
    spec: "dataEmpty",
    proposals: "data",
    path: `${PATH}?view=review`,
    singleStatus: true,
    visible: reviewing,
  },
  {
    name: "list-tables-large",
    spec: "large",
    path: `${PATH}?tab=tables`,
    singleStatus: true,
    visible: async (page) => {
      await tablesLoaded(page, 50);
      await expect(page.locator("[data-slot='count-bar']")).toContainText("80 tables");
    },
  },
  {
    name: "list-tables-search-empty",
    path: `${PATH}?tab=tables&q=zzzz`,
    singleStatus: true,
    visible: async (page) => {
      await expect(page.getByText("Aucune table ne correspond à « zzzz »")).toBeVisible();
    },
  },
  {
    name: "list-fixtures-large",
    spec: "large",
    path: `${PATH}?tab=fixtures`,
    singleStatus: true,
    visible: async (page) => {
      await fixtureLoaded(page);
      await expect(page.getByText("312 lignes · T-client · locale fr-FR")).toBeVisible();
    },
  },
  {
    name: "locked",
    role: "client",
    path: PATH,
    singleStatus: true,
    visible: async (page) => {
      await expect(page.getByText("Cette page est réservée à l'équipe")).toBeVisible();
    },
  },
  {
    name: "form-create",
    path: `${PATH}?tab=tables&new=1`,
    visible: async (page) => {
      await expect(
        page.getByRole("dialog").getByRole("heading", { name: "Nouvelle table" }),
      ).toBeVisible();
    },
  },
];

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const view of VIEWS) {
      if (view.desktopOnly && viewport.name) continue;
      test(`S-spec-data ${view.name} (${theme}${viewport.name}) : état, axe sans violation, capture`, async ({
        page,
      }) => {
        test.setTimeout(90_000);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await setScenario({
          session: true,
          projects: "data",
          installations: "single",
          ...(view.spec ? { spec: view.spec } : {}),
          ...(view.role ? { role: view.role } : {}),
          proposals: view.proposals ?? "none",
        });
        if (theme === "dark") {
          await page.goto(PATH);
          await switchToDark(page);
        }
        await page.goto(view.path);
        await view.visible(page);
        await view.act?.(page);
        await expect(page.locator("html")).toHaveClass(
          theme === "dark" ? /dark/ : /^((?!dark).)*$/,
        );
        if (view.singleStatus)
          expect(await page.locator("[role='status']").count()).toBeLessThanOrEqual(1);
        await settle(page);
        await view.settled?.(page);
        await page.screenshot({
          path: `${CAPTURES_DIR}/S-spec-data/${view.name}-${theme}${viewport.name}.png`,
          fullPage: true,
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        ).toBeLessThanOrEqual(0);
        const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(results.violations, JSON.stringify(results.violations.map((v) => v.id))).toEqual([]);
        await releaseHeld();
      });
    }
  }
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
test.describe("parcours de l'écran Données", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setScenario({ session: true, projects: "data", spec: "large", proposals: "none" });
  });

  test("onglets en liens avec compteurs, en-tête de l'état Liste, aucune action « Valider »", async ({
    page,
  }) => {
    await page.goto(`${PATH}?tab=tables`);
    await expect(page.getByRole("heading", { level: 1, name: "Modèle de données" })).toBeVisible();
    await expect(
      page.getByText("Validation de l'équipe · le client lit et commente"),
    ).toBeVisible();
    await expect(page.getByText(/80 tables · \d+ relations · 2 jeux d'exemple/)).toBeVisible();
    const tabs = page.getByRole("navigation", { name: "Sections du modèle de données" });
    await expect(tabs.getByRole("link", { name: /^Tables/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(tabs.getByRole("link", { name: /^Tables/ })).toContainText("80");
    await expect(tabs.getByRole("link", { name: /^Jeux d'exemple/ })).toContainText("2");
    await expect(page.getByRole("button", { name: /Valider|Commenter/ })).toHaveCount(0);
    await tabs.getByRole("link", { name: /^Jeux d'exemple/ }).click();
    await expect(page).toHaveURL(/tab=fixtures/);
    await expect(page.getByRole("region", { name: "Jeu d'exemple Clients" })).toBeVisible();
  });

  test("80 tables : pages de 50, « Charger la suite », recherche et zone sur des éléments non chargés", async ({
    page,
  }) => {
    await page.goto(`${PATH}?tab=tables`);
    await tablesLoaded(page, 50);
    await expect(page.locator("[data-slot='count-bar']")).toContainText("50 chargées");
    await page.getByRole("button", { name: "Charger la suite" }).click();
    await expect(page.locator("tbody tr[data-spec-id]")).toHaveCount(80);
    await expect(page.getByText(/Fin de la liste · 80 tables/)).toBeVisible();
    const search = page.getByRole("searchbox", { name: "Rechercher une table ou un champ" });
    await search.fill("Table 075");
    await expect(page.locator("tbody tr[data-spec-id]")).toHaveCount(1);
    await expect(page.locator("[data-spec-id='T-table-075']")).toBeVisible();
    await search.fill("");
    await page.getByRole("button", { name: "Zone" }).click();
    await page.getByRole("menuitemradio", { name: /Personnel/ }).click();
    await expect(page).toHaveURL(/zone=Personnel/);
    await expect(page.locator("tbody tr[data-spec-id]").first()).toContainText("Personnel");
  });

  test("lien direct ?sel=T-table-070 : la page qui contient la table, ligne repérée", async ({
    page,
  }) => {
    await page.goto(`${PATH}?tab=tables&sel=T-table-070`);
    const row = page.locator("[data-spec-id='T-table-070']");
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("aria-current", "true");
  });

  test("recherche sur un nom de champ non chargé : « consentement_sms » trouve la table Client", async ({
    page,
  }) => {
    await page.goto(`${PATH}?tab=tables`);
    await page
      .getByRole("searchbox", { name: "Rechercher une table ou un champ" })
      .fill("consentement");
    await expect(page.locator("tbody tr[data-spec-id]")).toHaveCount(1);
    await expect(page.locator("[data-spec-id='T-client']")).toBeVisible();
  });

  test("jeux d'exemple : 25 lignes par page, pagination numérotée « 26–50 sur 312 »", async ({
    page,
  }) => {
    await page.goto(`${PATH}?tab=fixtures`);
    const section = page.getByRole("region", { name: "Jeu d'exemple Clients" });
    await expect(section.locator("tbody tr")).toHaveCount(25);
    await expect(section.getByText(/1.25 sur 312/)).toBeVisible();
    await section.getByRole("button", { name: "Page suivante" }).click();
    await expect(section.getByText(/26.50 sur 312/)).toBeVisible();
    await expect(section.locator("tbody tr")).toHaveCount(25);
    await expect(section.getByText("25 lignes par page")).toBeVisible();
  });

  test("clavier : « / » va à la recherche, Tab atteint la région défilante, Échap ferme le formulaire", async ({
    page,
  }) => {
    await page.goto(`${PATH}?tab=tables`);
    await tablesLoaded(page, 50);
    await page.keyboard.press("/");
    await expect(
      page.getByRole("searchbox", { name: "Rechercher une table ou un champ" }),
    ).toBeFocused();
    await page.getByRole("region", { name: "Tables du modèle de données" }).focus();
    await expect(page.getByRole("region", { name: "Tables du modèle de données" })).toBeFocused();
    await page.getByRole("button", { name: "Modifier T-client, Client" }).click();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Modifier la table" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("formulaire : erreurs en résumé puis enregistrement d'une table, toast avec le commit, ligne ajoutée", async ({
    page,
  }) => {
    // Jeu de démo : la table créée tombe sur la première page (dans le volume, elle serait la 81e).
    await setScenario({ session: true, projects: "data", proposals: "none" });
    await page.goto(`${PATH}?tab=tables&new=1`);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Enregistrer dans la spec" }).click();
    await expect(dialog.getByText(/3 points à corriger/)).toBeFocused();
    await dialog.getByRole("textbox", { name: /^Nom/ }).fill("Avis client");
    await dialog.getByRole("combobox", { name: /^Zone/ }).fill("Qualité");
    await dialog
      .getByRole("textbox", { name: /^Champs/ })
      .fill("id · uuid · clé primaire\nnote · entier · 1 à 5");
    await dialog.getByRole("button", { name: "Enregistrer dans la spec" }).click();
    await expect(page.getByText(/T-avis-client enregistrée dans la spec · commit/)).toBeVisible();
    await expect(page.locator("[data-spec-id='T-avis-client']")).toBeVisible();
    const writes = await specWritesSeen();
    expect(writes.find((w) => w.kind === "submit")?.operations).toMatchObject([
      {
        kind: "table.create",
        name: "Avis client",
        zone: "Qualité",
        fields: [
          { name: "id", type: "uuid", primaryKey: true },
          { name: "note", type: "entier", constraints: "1 à 5" },
        ],
      },
    ]);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
test.describe("diagramme du modèle (TK-108)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setScenario({ session: true, projects: "data", proposals: "none" });
  });

  test("sélection : la table est pressée, sa fiche s'ancre avec Fiche, YAML et Mermaid", async ({
    page,
  }) => {
    await page.goto(`${PATH}?tab=diagram`);
    await diagramLoaded(page, 6);
    await pick(page, "Réservation");
    await expect(card(page, "Réservation")).toHaveAttribute("aria-pressed", "true");
    await expect(fiche(page).getByRole("table", { name: "Champs de la table" })).toBeVisible();
    await fiche(page).getByRole("button", { name: "YAML" }).click();
    await expect(fiche(page).locator("pre")).toContainText("id: T-reservation");
    await fiche(page).getByRole("button", { name: "Mermaid" }).click();
    await expect(fiche(page).locator("pre")).toContainText("erDiagram");
  });

  test("glisser une table enregistre toute la mise en page une seule fois", async ({ page }) => {
    await page.goto(`${PATH}?tab=diagram`);
    await diagramLoaded(page, 6);
    await page.getByRole("button", { name: "Ajuster à l'écran" }).click();
    const box = await card(page, "Service").boundingBox();
    if (!box) throw new Error("carte Service introuvable");
    await page.mouse.move(box.x + 40, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 140, box.y + 60, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await layoutSavesSeen()).length, { timeout: 5000 }).toBe(1);
    const [saved] = await layoutSavesSeen();
    expect(Object.keys(saved?.positions ?? {})).toEqual(["T-service"]);
  });

  test("Alt + flèche déplace la table de 20 px (alternative au glisser) et enregistre", async ({
    page,
  }) => {
    await page.goto(`${PATH}?tab=diagram`);
    await diagramLoaded(page, 6);
    await card(page, "Client").focus();
    await page.keyboard.press("Alt+ArrowRight");
    await expect(page.getByText("Client déplacée")).toBeAttached();
    await expect.poll(async () => (await layoutSavesSeen()).length, { timeout: 5000 }).toBe(1);
  });

  test("zoom mémorisé par navigateur : rouvert au rechargement", async ({ page }) => {
    await page.goto(`${PATH}?tab=diagram`);
    await diagramLoaded(page, 6);
    await zoom(page, "Zoomer", 1);
    await expect(page.getByRole("button", { name: "110 %, revenir à 100 %" })).toBeVisible();
    await page.reload();
    await diagramLoaded(page, 6);
    await expect(page.getByRole("button", { name: "110 %, revenir à 100 %" })).toBeVisible();
  });

  test("sous 1024 px, Tables s'ouvre par défaut", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto(PATH);
    await tablesLoaded(page, 6);
    await expect(page.getByRole("region", { name: "Diagramme entité-relation" })).toHaveCount(0);
  });

  test("designer : lecture seule, pas de glisser ni de « Modifier », YAML visible", async ({
    page,
  }) => {
    await setScenario({ session: true, projects: "data", role: "designer", proposals: "none" });
    await page.goto(`${PATH}?tab=diagram`);
    await diagramLoaded(page, 6);
    await page.getByRole("button", { name: "Ajuster à l'écran" }).click();
    const box = await card(page, "Service").boundingBox();
    if (!box) throw new Error("carte Service introuvable");
    await page.mouse.move(box.x + 40, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 140, box.y + 60, { steps: 8 });
    await page.mouse.up();
    await pick(page, "Service");
    await expect(fiche(page).getByRole("button", { name: "Modifier" })).toHaveCount(0);
    await fiche(page).getByRole("button", { name: "YAML" }).click();
    await expect(fiche(page).getByText("Source de vérité")).toBeVisible();
    await page.waitForTimeout(1000);
    expect(await layoutSavesSeen()).toHaveLength(0);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
test.describe("relecture et droits", () => {
  test("relecture : onglet Relecture devant Diagramme, bandeau sur tous les onglets, « Quitter »", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setScenario({ session: true, projects: "data", spec: "dataEmpty", proposals: "data" });
    await page.goto(`${PATH}?view=review`);
    const tabs = page.getByRole("navigation", { name: "Sections du modèle de données" });
    await expect(tabs.getByRole("link").first()).toContainText("Relecture");
    await expect(tabs.getByRole("link").first()).toContainText("Relecture8");
    await expect(page.getByRole("group", { name: "Mode relecture" })).toContainText(
      "l'agent propose 8 éléments depuis le cahier fonctionnel",
    );
    await tabs.getByRole("link", { name: /^Tables/ }).click();
    await expect(page.getByRole("group", { name: "Mode relecture" })).toBeVisible();
    await expect(page.getByText("À relire").first()).toBeVisible();
    await page.getByRole("button", { name: "Quitter la relecture" }).click();
    await expect(page).not.toHaveURL(/view=review/);
    await expect(page.getByRole("group", { name: "Mode relecture" })).toHaveCount(0);
  });

  test("rejeter une table : la relation qui la vise est retirée à l'enregistrement et le récapitulatif le dit", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setScenario({ session: true, projects: "data", proposals: "data" });
    await page.goto(`${PATH}?view=review`);
    await page
      .getByRole("button", { name: /Client/ })
      .first()
      .click();
    await page.getByRole("button", { name: /^Rejeter/ }).click();
    await page
      .getByRole("button", { name: /Réservation/ })
      .first()
      .click();
    await page
      .getByRole("button", { name: /^Accepter/ })
      .first()
      .click();
    await page.getByRole("button", { name: /Enregistrer 1 dans la spec/ }).click();
    await expect(
      page.getByText(/1 relation et 1 champ ref retirés avec les tables rejetées/).first(),
    ).toBeVisible();
  });

  test("designer : lecture seule, sans « Ajouter une table » ni « Proposer »", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setScenario({ session: true, projects: "data", role: "designer", proposals: "none" });
    await page.goto(`${PATH}?tab=tables`);
    await tablesLoaded(page, 6);
    await expect(page.getByRole("button", { name: "Ajouter une table" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Proposer/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Modifier T-/ })).toHaveCount(0);
  });

  test("client : « réservée à l'équipe », aucune lecture des Données", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setScenario({ session: true, projects: "data", role: "client", proposals: "none" });
    await page.goto(PATH);
    await expect(page.getByText("Cette page est réservée à l'équipe")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajouter une table" })).toHaveCount(0);
  });

  test("375 px : aucun défilement horizontal de la page, tableau défilant dans sa région nommée", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await setScenario({ session: true, projects: "data", spec: "large", proposals: "none" });
    await page.goto(`${PATH}?tab=tables`);
    await tablesLoaded(page, 50);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await expect(page.getByRole("region", { name: "Tables du modèle de données" })).toHaveAttribute(
      "tabindex",
      "0",
    );
  });
});
