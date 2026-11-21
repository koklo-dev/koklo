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
import type { ArchitectureMode } from "./support/stub-spec-architecture.ts";

/**
 * TK-111 lot C, écran Architecture (design/screens/S-spec-architecture.md, maquette 13) : chaque état (Prêt, Génération,
 * Relecture, Liste · équipe) sur les onglets Document et Composants, en clair, sombre et à 375 px, avec axe et sans
 * défilement horizontal de page, plus la relecture groupée par type (66 propositions), le volume de 120 composants, la
 * feuille Composant et les droits. Pile locale : faux API (support/stub-spec-architecture.ts). Captures dans
 * design/screens/captures/S-spec-architecture/<état>-<onglet>-<thème>[-mobile].png.
 */
const PATH = `/projects/${FEATURE_PROJECT_ID}/spec/architecture`;
const VIEWPORTS = [
  { name: "", width: 1280, height: 800 },
  { name: "-mobile", width: 375, height: 800 },
] as const;
const THEMES: Theme[] = ["light", "dark"];

interface View {
  name: string;
  architecture: ArchitectureMode;
  proposals?: ProposalsMode;
  role?: KanbanRole;
  path: string;
  visible: (page: Page) => Promise<void>;
}

const grid = (page: Page) => page.getByRole("table", { name: "Composants de l'architecture" });
const componentsLoaded = async (page: Page, rows: number) => {
  await expect(grid(page)).toBeVisible();
  await expect(page.locator("tbody tr[data-spec-id]")).toHaveCount(rows);
};
const documentLoaded = async (page: Page) => {
  await expect(page.getByRole("navigation", { name: "Sections du document" })).toBeVisible();
  await expect(page.getByText("architecture/overview/01-contexte.md")).toBeVisible();
};
const reviewBanner = (page: Page) => page.getByRole("group", { name: "Mode relecture" });

const ready = async (page: Page) => {
  await expect(page.getByText("L'agent peut proposer l'architecture")).toBeVisible();
  await expect(page.getByRole("button", { name: "Écrire à la main" })).toBeVisible();
};
const generating = async (page: Page) => {
  await expect(page.getByText(/L'agent rédige l'architecture zone par zone/)).toBeVisible();
  await expect(page.locator("[data-slot='data-generating'] [data-slot='skeleton']")).toHaveCount(7);
};

const VIEWS: View[] = (["document", "components"] as const).flatMap((tab): View[] => [
  {
    name: `ready-${tab}`,
    architecture: "empty",
    path: `${PATH}?tab=${tab}`,
    visible: ready,
  },
  {
    name: `generating-${tab}`,
    architecture: "demo",
    proposals: "generating",
    path: `${PATH}?tab=${tab}&view=review`,
    visible: generating,
  },
  {
    name: `review-${tab}`,
    architecture: "demo",
    proposals: "architecture",
    path: `${PATH}?tab=${tab}&view=review`,
    visible: async (page) => {
      await expect(reviewBanner(page)).toBeVisible();
      if (tab === "components") await componentsLoaded(page, 12);
      else
        await expect(
          page.getByRole("group", { name: "Section proposée par l'agent" }),
        ).toBeVisible();
    },
  },
  {
    name: `list-${tab}`,
    architecture: "demo",
    path: `${PATH}?tab=${tab}`,
    visible: (page) => (tab === "components" ? componentsLoaded(page, 8) : documentLoaded(page)),
  },
]);

VIEWS.push(
  {
    name: "review-review",
    architecture: "demo",
    proposals: "architecture",
    path: `${PATH}?view=review`,
    visible: async (page) => {
      await expect(reviewBanner(page)).toBeVisible();
      await expect(page.getByText("Avertissements d'architecture", { exact: false })).toBeVisible();
    },
  },
  {
    name: "review-grouped",
    architecture: "volume",
    proposals: "architectureVolume",
    path: `${PATH}?view=review`,
    visible: async (page) => {
      await expect(reviewBanner(page)).toBeVisible();
      await expect(page.getByText("Groupées par type")).toBeVisible();
    },
  },
  {
    name: "list-components-volume",
    architecture: "volume",
    path: `${PATH}?tab=components`,
    visible: (page) => componentsLoaded(page, 50),
  },
  {
    name: "list-components-empty-search",
    architecture: "demo",
    path: `${PATH}?tab=components&q=zzz`,
    visible: async (page) => {
      await expect(page.getByText("Aucun composant ne correspond à « zzz »")).toBeVisible();
    },
  },
  {
    name: "list-components-sheet",
    architecture: "demo",
    path: `${PATH}?tab=components&edit=C-api`,
    visible: async (page) => {
      await expect(page.getByRole("dialog").getByRole("textbox", { name: /^Nom/ })).toHaveValue(
        "API",
      );
    },
  },
  {
    name: "list-components-designer",
    architecture: "demo",
    role: "designer",
    path: `${PATH}?tab=components`,
    visible: (page) => componentsLoaded(page, 8),
  },
);

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const view of VIEWS) {
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
          proposals: view.proposals ?? "none",
        });
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

const start = async (
  page: Page,
  over: { architecture?: ArchitectureMode; proposals?: ProposalsMode; role?: KanbanRole } = {},
) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setScenario({
    session: true,
    projects: "data",
    installations: "single",
    architecture: over.architecture ?? "demo",
    proposals: over.proposals ?? "none",
    ...(over.role ? { role: over.role } : {}),
  });
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
test.describe("parcours de l'écran Architecture", () => {
  test("en-tête et onglets : Schéma, Document, Composants, Décisions et Flux", async ({ page }) => {
    await start(page);
    await page.goto(PATH);
    await expect(page.getByRole("heading", { level: 1, name: "Architecture" })).toBeVisible();
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
    await expect(page.getByRole("button", { name: "Valider l'architecture" })).toBeVisible();
  });

  test("Document : choisir une section l'ouvre, la légende reste en bas, les statuts sont écrits", async ({
    page,
  }) => {
    await start(page);
    await page.goto(`${PATH}?tab=document`);
    const nav = page.getByRole("navigation", { name: "Sections du document" });
    await nav.getByRole("button", { name: /Principes/ }).click();
    await expect(page).toHaveURL(/s=principes/);
    await expect(page.getByText("architecture/overview/03-principes.md")).toBeVisible();
    await expect(page.getByRole("button", { name: "Marquer comme validée" })).toBeVisible();
    await expect(nav.getByRole("list", { name: "Légende des statuts" })).toHaveText(
      "ValidéeÀ relireBrouillonÀ rédiger",
    );
    await nav.getByRole("button", { name: /Sauvegarde et reprise/ }).click();
    await expect(page.getByText("Section à rédiger")).toBeVisible();
  });

  test("Composants : la recherche passe par le serveur, le lien direct amène un composant hors page 1", async ({
    page,
  }) => {
    await start(page, { architecture: "volume" });
    await page.goto(`${PATH}?tab=components`);
    await expect(page.locator("tbody tr[data-spec-id]")).toHaveCount(50);
    await expect(page.getByText(/Les 50 suivants se chargent/)).toBeVisible();
    await page.getByRole("searchbox", { name: "Rechercher un composant" }).fill("composant 119");
    await expect(page.locator("tbody tr[data-spec-id]")).toHaveCount(1);
    await page.goto(`${PATH}?tab=components&c=C-composant-099`);
    await expect(page.locator("tr[data-spec-id='C-composant-099']")).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("Composants : une ligne ouvre le Schéma sur la zone du composant, composant choisi (B585)", async ({
    page,
  }) => {
    await start(page);
    await page.goto(`${PATH}?tab=components`);
    await page.getByRole("button", { name: "Ouvrir dans le schéma C-api, API" }).click();
    await expect(page).toHaveURL(/tab=schema/);
    await expect(page).toHaveURL(/sel=C-api/);
  });

  test("Composants : pied « Fin de la liste · 8 composants » sur la démo", async ({ page }) => {
    await start(page);
    await page.goto(`${PATH}?tab=components`);
    await expect(page.getByText("Fin de la liste · 8 composants")).toBeVisible();
  });

  test("« Nouveau composant » et « Modifier » ouvrent la feuille, Échap rend le focus", async ({
    page,
  }) => {
    await start(page);
    // Sous 1024 px, une ligne ouvre la fiche en feuille ; dès 1024 px elle ouvre le Schéma (B585).
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto(`${PATH}?tab=components`);
    const create = page.getByRole("button", { name: "Nouveau composant" });
    await create.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Nouveau composant" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(create).toBeFocused();
    const row = page.getByRole("button", { name: "Modifier C-api, API" });
    await row.click();
    await expect(page.getByRole("dialog").getByRole("textbox", { name: /^Nom/ })).toHaveValue(
      "API",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(row).toBeFocused();
  });

  test("relecture groupée par type dès 30 : Document, Composants, Flux, Décisions", async ({
    page,
  }) => {
    await start(page, { architecture: "volume", proposals: "architectureVolume" });
    await page.goto(`${PATH}?view=review`);
    await expect(page.getByText("66 propositions à relire")).toBeVisible();
    for (const label of ["Document · vue d'ensemble", "Composants", "Flux", "Décisions"]) {
      await expect(
        page.getByRole("button", { name: new RegExp(`^${label}`) }).first(),
      ).toBeVisible();
    }
    await expect(page.getByText("Groupées par type")).toBeVisible();
  });

  test("relecture : Relecture devant Document et Composants, bandeau sur tous les onglets, « Quitter »", async ({
    page,
  }) => {
    await start(page, { proposals: "architecture" });
    await page.goto(`${PATH}?view=review`);
    const tabs = page.getByRole("navigation", { name: "Sections de l'architecture" });
    await expect(tabs.getByRole("link").first()).toContainText("Relecture9");
    await expect(reviewBanner(page)).toContainText(
      "l'agent propose 9 éléments depuis le fonctionnel et les données",
    );
    await tabs.getByRole("link", { name: /^Composants/ }).click();
    await expect(reviewBanner(page)).toBeVisible();
    await page.getByRole("button", { name: "Quitter la relecture" }).click();
    await expect(page).not.toHaveURL(/view=review/);
    await expect(reviewBanner(page)).toHaveCount(0);
  });

  test("designer : lecture seule, aucun bouton d'écriture ni « Proposer »", async ({ page }) => {
    await start(page, { role: "designer" });
    await page.goto(`${PATH}?tab=components`);
    await expect(grid(page)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Nouveau composant|Proposer|Modifier/ }),
    ).toHaveCount(0);
    await page.goto(`${PATH}?tab=document&s=principes`);
    await expect(page.getByText("architecture/overview/03-principes.md")).toBeVisible();
    await expect(page.getByRole("button", { name: "Marquer comme validée" })).toHaveCount(0);
  });

  test("client : vue en lecture seule du livrable validé, sans redirection (TK-113)", async ({
    page,
  }) => {
    await start(page, { role: "client" });
    await setScenario({
      session: true,
      projects: "data",
      installations: "single",
      architecture: "demo",
      archState: "validated",
      role: "client",
      proposals: "none",
    });
    await page.goto(PATH);
    await expect(page.getByRole("note")).toContainText("Lecture seule.");
    await expect(page).toHaveURL(new RegExp(`/projects/${FEATURE_PROJECT_ID}/spec/architecture$`));
    await expect(page.getByRole("heading", { level: 1, name: "Architecture" })).toBeVisible();
  });
});
