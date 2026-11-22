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
  switchToDark,
  type Theme,
} from "./support/helpers.ts";
import { FEATURE_PROJECT_ID } from "./support/stub-features.ts";
import type { ArchitectureMode } from "./support/stub-spec-architecture.ts";

/**
 * TK-112 lot B, onglets Schéma et Flux de l'écran Architecture (design/screens/S-spec-architecture.md, maquette 13
 * l.175-239 et 405-441) : vue des zones, zone ouverte avec sélection et fiche, zoom 50 %, Flux en séquence et en
 * YAML, glisser enregistré une fois, droits. Captures, clair, sombre et 375 px, dans
 * design/screens/captures/S-spec-architecture/<état>-<onglet>-<thème>[-mobile].png. Faux API : support/stub-spec-architecture.ts.
 */
const PATH = `/projects/${FEATURE_PROJECT_ID}/spec/architecture`;
const VIEWPORTS = [
  { name: "", width: 1280, height: 900 },
  { name: "-mobile", width: 375, height: 800 },
] as const;
const THEMES: Theme[] = ["light", "dark"];

const schemaRegion = (page: Page) => page.getByRole("region", { name: /^Schéma d'architecture/ });
const node = (page: Page, name: RegExp | string) => page.getByRole("button", { name });
const fiche = (page: Page) => page.getByRole("complementary", { name: "Fiche du composant" });
const flowImage = (page: Page) => page.getByRole("img", { name: /^Diagramme de séquence/ });

const layersLoaded = async (page: Page) => {
  await expect(schemaRegion(page)).toBeVisible();
  await expect(node(page, "Service API")).toBeVisible();
};
const zonesLoaded = async (page: Page, count = 120) => {
  await expect(page.getByText(`Toutes les zones · ${count} composants`)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Zone / }).first()).toBeVisible();
};
/** TK-114c (B641) : zone « Commandes » du mode toto, ses traits vers les cartes estompées des zones voisines. */
const TOTO_ZONE = "Commandes";
const crossTraits = (page: Page) => page.locator("[data-relation*='>zone:']");
const totoZoneLoaded = async (page: Page) => {
  await expect(node(page, /^Service Commandes/)).toBeVisible();
  await expect(node(page, /, autre zone$/).first()).toBeVisible();
  await expect(crossTraits(page)).toHaveCount(3);
  // Les cartes estompées ont leur rangée sous les couches (B648) : la capture les montre avec leurs traits.
  await node(page, /, autre zone$/)
    .last()
    .scrollIntoViewIfNeeded();
};
const FIRST_FLOW = "P-reserver-un-rendez-vous";
/** Sous 768 px, la liste d'abord puis le détail : le flux se choisit par `?f=` (fiche §7). */
const flowPath = (page: Page, tab = "flows") =>
  `${PATH}?tab=${tab}${(page.viewportSize()?.width ?? 1280) < 768 ? `&f=${FIRST_FLOW}` : ""}`;
const flowLoaded = async (page: Page) => {
  await expect(flowImage(page)).toBeVisible();
  await expect(page.getByText("La veille à 18 h")).toBeVisible();
};

interface View {
  name: string;
  architecture: ArchitectureMode;
  role?: KanbanRole;
  path: string;
  visible: (page: Page) => Promise<void>;
  /** Avant l'ouverture (erreur simulée) ou une fois l'état affiché (zoom). */
  setup?: (page: Page) => Promise<void>;
  /** Capturé au bureau seulement (la zone ouverte est un lecteur masqué sous 768 px). */
  desktopOnly?: boolean;
}

const VIEWS: View[] = [
  {
    name: "zones-schema",
    architecture: "volume",
    path: `${PATH}?tab=schema`,
    visible: (page) => zonesLoaded(page),
  },
  {
    name: "zones-toto-schema",
    architecture: "toto",
    path: `${PATH}?tab=schema`,
    visible: (page) => zonesLoaded(page, 23),
  },
  {
    name: "zone-open-toto-schema",
    architecture: "toto",
    path: `${PATH}?tab=schema&zone=${TOTO_ZONE}`,
    desktopOnly: true,
    visible: totoZoneLoaded,
  },
  {
    name: "zone-open-schema",
    architecture: "demo",
    path: `${PATH}?tab=schema&sel=C-api`,
    visible: async (page) => {
      // Sous 1280 px la fiche est une feuille modale : le lecteur derrière elle est masqué aux lecteurs d'écran.
      await expect(
        fiche(page).or(page.getByRole("dialog", { name: "Fiche du composant" })),
      ).toBeVisible();
      if ((page.viewportSize()?.width ?? 0) >= 1280) await layersLoaded(page);
    },
  },
  {
    name: "zone-open-zoned-schema",
    architecture: "volume",
    path: `${PATH}?tab=schema&zone=Communication&sel=C-sms`,
    desktopOnly: true,
    visible: async (page) => {
      await expect(
        fiche(page).or(page.getByRole("dialog", { name: "Fiche du composant" })),
      ).toBeVisible();
      await expect(node(page, /, autre zone$/).first()).toBeVisible();
    },
  },
  {
    name: "zoom-schema",
    architecture: "demo",
    path: `${PATH}?tab=schema`,
    visible: layersLoaded,
    setup: async (page) => {
      for (let i = 0; i < 6; i += 1) {
        if (await page.getByText("Zoom 50 %").count()) break;
        await page.getByRole("button", { name: "Dézoomer" }).click();
      }
    },
  },
  { name: "diagram-flows", architecture: "demo", path: `${PATH}?tab=flows`, visible: flowLoaded },
  {
    name: "yaml-flows",
    architecture: "demo",
    path: `${PATH}?tab=flows`,
    visible: async (page) => {
      await flowLoaded(page);
      await page
        .getByRole("group", { name: "Affichage du flux" })
        .getByRole("button", { name: "YAML" })
        .click();
      await expect(page.getByText("architecture/flows/reserver-un-rendez-vous.yaml")).toBeVisible();
    },
  },
  {
    name: "mermaid-flows",
    architecture: "demo",
    path: `${PATH}?tab=flows`,
    visible: async (page) => {
      await flowLoaded(page);
      await page
        .getByRole("group", { name: "Affichage du flux" })
        .getByRole("button", { name: "Mermaid" })
        .click();
      await expect(page.getByText("architecture/flows/reserver-un-rendez-vous.mmd")).toBeVisible();
    },
  },
  {
    name: "error-schema",
    architecture: "demo",
    path: `${PATH}?tab=schema`,
    setup: async (page) => {
      await page.route("**/spec/architecture/zones*", (route) =>
        route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
      );
    },
    visible: async (page) => {
      await expect(page.getByText("Impossible de charger le schéma")).toBeVisible();
    },
  },
];

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const view of VIEWS.filter((entry) => !(entry.desktopOnly && viewport.width < 768))) {
      test(`S-spec-architecture ${view.name} (${theme}${viewport.name}) : état, axe sans violation, capture`, async ({
        page,
      }) => {
        test.setTimeout(90_000);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await setScenario({
          session: true,
          projects: "data",
          installations: "single",
          architecture: view.architecture,
          ...(view.role ? { role: view.role } : {}),
          proposals: "none",
        });
        if (theme === "dark") {
          await page.goto(PATH);
          await switchToDark(page);
        }
        if (view.name === "error-schema") await view.setup?.(page);
        await page.goto(view.path.includes("tab=flows") ? flowPath(page) : view.path);
        await view.visible(page);
        if (view.name !== "error-schema") await view.setup?.(page);
        await expect(page.locator("html")).toHaveClass(
          theme === "dark" ? /dark/ : /^((?!dark).)*$/,
        );
        await settle(page);
        await page.screenshot({
          path: `${CAPTURES_DIR}/S-spec-architecture/${view.name}-${theme}${viewport.name}.png`,
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

const start = async (page: Page, architecture: ArchitectureMode = "demo", role?: KanbanRole) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setScenario({
    session: true,
    projects: "data",
    installations: "single",
    architecture,
    proposals: "none",
    ...(role ? { role } : {}),
  });
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
test.describe("parcours des onglets Schéma et Flux", () => {
  test("Schéma par défaut sur le bureau : couches, formes écrites, comptes de l'en-tête", async ({
    page,
  }) => {
    await start(page);
    await page.goto(PATH);
    const tabs = page.getByRole("navigation", { name: "Sections de l'architecture" });
    await expect(tabs.getByRole("link")).toHaveText([
      "Schéma",
      "Document",
      /^Composants/,
      /^Décisions/,
      /^Flux/,
    ]);
    await expect(tabs.getByRole("link", { name: "Schéma" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByText("8 composants · 23 décisions · 18 flux").first()).toBeVisible();
    await layersLoaded(page);
    for (const label of [
      "Utilisateurs",
      "Applications",
      "Services",
      "Données et services externes",
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(node(page, "Acteur Client")).toBeVisible();
    await expect(node(page, "Externe Fournisseur SMS")).toBeVisible();
    await expect(page.getByRole("button", { name: "Valider l'architecture" })).toBeVisible();
  });

  test("vue des zones (120 composants) → zone → fiche Fiche · YAML · Mermaid, zone voisine estompée", async ({
    page,
  }) => {
    await start(page, "volume");
    await page.goto(`${PATH}?tab=schema`);
    await zonesLoaded(page);
    await page
      .getByRole("button", { name: /^Zone Communication/ })
      .first()
      .click();
    await expect(page).toHaveURL(/zone=Communication/);
    await expect(node(page, /^Service Worker/)).toBeVisible();
    const ghost = node(page, /, autre zone$/).first();
    await expect(ghost).toBeVisible();
    await expect(ghost).not.toHaveAttribute("aria-pressed", /.*/);
    await node(page, /^Externe Fournisseur SMS/).click();
    await expect(page).toHaveURL(/sel=C-sms/);
    await expect(fiche(page)).toContainText("C-sms");
    await fiche(page).getByRole("button", { name: "YAML" }).click();
    await expect(fiche(page).locator("pre")).toContainText("id: C-sms");
    await fiche(page).getByRole("button", { name: "Mermaid" }).click();
    await expect(fiche(page).locator("pre")).toContainText("flowchart TB");
    await page.keyboard.press("Escape");
    await ghost.click();
    await expect(page).not.toHaveURL(/zone=Communication/);
  });

  test("TK-114c : 23 composants en 8 zones → zone → traits vers les cartes estompées, l'asynchrone en pointillé", async ({
    page,
  }) => {
    await start(page, "toto");
    await page.goto(`${PATH}?tab=schema`);
    await zonesLoaded(page, 23);
    await expect(page.getByRole("button", { name: /^Zone / })).toHaveCount(8);
    await page
      .getByRole("button", { name: new RegExp(`^Zone ${TOTO_ZONE}`) })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`zone=${TOTO_ZONE}`));
    await totoZoneLoaded(page);
    await expect(
      page.locator("[data-relation='C-toto-commandes>zone:Paiement']"),
    ).not.toHaveAttribute("stroke-dasharray", /.*/);
    await expect(page.locator("[data-relation='C-toto-commandes>zone:Messages']")).toHaveAttribute(
      "stroke-dasharray",
      "5 4",
    );
    await expect(page.locator("[data-relation='C-toto-panier>zone:Catalogue']")).toHaveCount(1);
    await expect(page.getByText("publie", { exact: true })).toBeVisible();
  });

  test("TK-114c : mode demo (8 composants) reste à plat, les liens entre zones tracés en direct", async ({
    page,
  }) => {
    await start(page);
    await page.goto(`${PATH}?tab=schema`);
    await layersLoaded(page);
    await expect(page.getByText(/^Toutes les zones/)).toHaveCount(0);
    await expect(page.locator("[data-relation='C-api>C-auth']")).toHaveCount(1);
    await expect(crossTraits(page)).toHaveCount(0);
  });

  test("« Aller à un composant… » : « / » focalise, Entrée ouvre la zone du composant", async ({
    page,
  }) => {
    await start(page, "volume");
    await page.goto(`${PATH}?tab=schema`);
    await zonesLoaded(page);
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("/");
    const jump = page.getByRole("combobox", { name: "Aller à un composant" });
    await expect(jump).toBeFocused();
    await jump.fill("passerelle");
    await expect(page.locator("datalist option")).not.toHaveCount(0);
    await jump.press("Enter");
    await expect(page).toHaveURL(/sel=C-pay/);
    await expect(page).toHaveURL(/zone=Paiement/);
  });

  test("zoom 50 % : seuls les noms s'affichent", async ({ page }) => {
    await start(page);
    await page.goto(`${PATH}?tab=schema`);
    await layersLoaded(page);
    for (let i = 0; i < 6; i += 1) {
      if (await page.getByText("Zoom sous 60 %").count()) break;
      await page.getByRole("button", { name: "Dézoomer" }).click();
    }
    await expect(page.getByText("Zoom sous 60 % : seuls les noms s'affichent.")).toBeVisible();
    await expect(page.locator("[data-slot='arch-node'] .truncate.text-\\[11px\\]")).toHaveCount(0);
  });

  test("glisser un composant enregistre toute la vue une seule fois (architecture.layout.save)", async ({
    page,
  }) => {
    await start(page);
    await page.goto(`${PATH}?tab=schema`);
    await layersLoaded(page);
    await page.getByRole("button", { name: "Ajuster à l'écran" }).click();
    const box = await node(page, "Service API").boundingBox();
    if (!box) throw new Error("nœud API introuvable");
    await page.mouse.move(box.x + 30, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 130, box.y + 50, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await layoutSavesSeen()).length, { timeout: 5000 }).toBe(1);
    const [saved] = await layoutSavesSeen();
    expect(Object.keys(saved?.positions ?? {})).toContain("C-api");
    expect(Object.keys(saved?.positions ?? {})).toContain("RL-client");
  });

  test("Flux : 50 par page sur le volume, séquence avec bloc alt et séparateur, « Lire les messages »", async ({
    page,
  }) => {
    await start(page, "volume");
    await page.goto(`${PATH}?tab=flows`);
    await flowLoaded(page);
    await expect(page.getByText("300 flux").first()).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Flux de l'architecture" }).getByRole("listitem"),
    ).toHaveCount(50);
    await page.getByText("Lire les messages").click();
    await expect(
      page.getByRole("listitem").filter({ hasText: "Client vers Application web" }),
    ).toBeVisible();
    await page.goto(`${PATH}?tab=flows&f=P-flux-199`);
    await expect(page.getByRole("heading", { level: 2, name: "Flux 199" })).toBeVisible();
  });

  test("Flux : choisir un flux, YAML puis Mermaid", async ({ page }) => {
    await start(page);
    await page.goto(`${PATH}?tab=flows`);
    await flowLoaded(page);
    await page.getByRole("button", { name: /Annuler ou déplacer/ }).click();
    await expect(page).toHaveURL(/f=P-annuler-ou-deplacer/);
    const group = page.getByRole("group", { name: "Affichage du flux" });
    await group.getByRole("button", { name: "YAML" }).click();
    await expect(page.getByText("Source de vérité", { exact: true })).toBeVisible();
    await group.getByRole("button", { name: "Mermaid" }).click();
    await expect(page.getByText("Généré", { exact: true })).toBeVisible();
  });

  test("designer : lit schéma et flux, sans glisser, sans « Modifier » ni « Nouveau flux »", async ({
    page,
  }) => {
    await start(page, "demo", "designer");
    await page.goto(`${PATH}?tab=schema&sel=C-api`);
    await layersLoaded(page);
    await expect(fiche(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Modifier" })).toHaveCount(0);
    await expect(page.locator("[data-slot='diagram-node'].cursor-grab")).toHaveCount(0);
    await page.goto(`${PATH}?tab=flows`);
    await flowLoaded(page);
    await expect(page.getByRole("button", { name: "Nouveau flux" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "YAML" })).toBeVisible();
  });

  test("sous 1024 px, Composants s'ouvre par défaut ; un tab= explicite prime", async ({
    page,
  }) => {
    await start(page);
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto(PATH);
    await expect(page.getByRole("table", { name: "Composants de l'architecture" })).toBeVisible();
    await expect(schemaRegion(page)).toHaveCount(0);
    await page.goto(`${PATH}?tab=schema`);
    await expect(schemaRegion(page)).toBeVisible();
  });
});
