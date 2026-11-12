import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  AXE_TAGS,
  CAPTURES_DIR,
  releaseHeld,
  setScenario,
  settle,
  switchToDark,
  type Theme,
} from "./support/helpers.ts";
import { FEATURE_PROJECT_ID, type SpecMode } from "./support/stub-features.ts";
import type { ProposalsMode } from "./support/stub-proposals.ts";

/**
 * TK-102 lot B, écran Fonctionnel (design/screens/S-spec-functional.md, maquette 10) : les états Prêt, Génération,
 * Relecture et Liste · équipe, clair, sombre et 375 px, avec axe et une seule région status. Pile locale : faux API.
 * Captures dans design/screens/captures/S-spec-functional/<état>-<thème>[-mobile].png.
 */
const PATH = `/projects/${FEATURE_PROJECT_ID}/spec/functional`;
const VIEWPORTS = [
  { name: "", width: 1280, height: 800 },
  { name: "-mobile", width: 375, height: 800 },
] as const;
const THEMES: Theme[] = ["light", "dark"];
const FICHE = "Fiche de la fonctionnalité";

interface View {
  name: string;
  spec?: SpecMode;
  proposals?: ProposalsMode;
  path: string;
  visible: (page: Page) => Promise<void>;
  /** Pastille de l'en-tête attendue (`data-status`). */
  status: string;
  /** Une seule région `role=status` (axe, annonces). */
  singleStatus?: boolean;
}

const header = (page: Page) => page.locator("[data-slot='project-header']");

const VIEWS: View[] = [
  {
    name: "ready",
    spec: "empty",
    proposals: "none",
    path: PATH,
    status: "ready",
    visible: async (page) => {
      await expect(page.getByText("L'agent peut proposer le cahier fonctionnel")).toBeVisible();
      await expect(header(page).getByRole("button")).toHaveCount(0);
    },
  },
  {
    name: "generating",
    proposals: "generating",
    path: `${PATH}?view=review`,
    status: "generating",
    singleStatus: true,
    visible: async (page) => {
      await expect(page.getByText("L'agent rédige le cahier fonctionnel")).toBeVisible();
      await expect(header(page).getByRole("button", { name: "Ajouter" })).toBeVisible();
    },
  },
  {
    name: "review",
    proposals: "ready",
    path: `${PATH}?view=review`,
    status: "in_progress",
    singleStatus: true,
    visible: async (page) => {
      await expect(page.getByRole("region", { name: "Relecture des propositions" })).toBeVisible();
      await expect(header(page).getByRole("button", { name: "Reproposer" })).toBeVisible();
    },
  },
  {
    name: "list",
    proposals: "none",
    path: `${PATH}?sel=F-001`,
    status: "in_progress",
    visible: async (page) => {
      await expect(page.getByRole("complementary", { name: FICHE })).toBeVisible();
      await expect(
        header(page).getByRole("button", { name: /Nouvelle fonctionnalité/ }),
      ).toBeVisible();
    },
  },
  {
    name: "list-no-sheet",
    proposals: "none",
    path: PATH,
    status: "in_progress",
    singleStatus: true,
    visible: async (page) => {
      await expect(page.getByRole("list", { name: "Fonctionnalités" })).toBeVisible();
      await expect(page.getByRole("complementary", { name: FICHE })).toHaveCount(0);
    },
  },
  {
    name: "list-search-empty",
    proposals: "none",
    path: `${PATH}?q=introuvable`,
    status: "in_progress",
    singleStatus: true,
    visible: async (page) => {
      await expect(page.locator("[data-slot='empty-state']")).toContainText(
        "Aucune fonctionnalité ne correspond à « introuvable »",
      );
    },
  },
];

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const view of VIEWS) {
      test(`S-spec-functional ${view.name} (${theme}${viewport.name}) : état, axe sans violation, capture`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await setScenario({
          session: true,
          projects: "data",
          installations: "single",
          ...(view.spec ? { spec: view.spec } : {}),
          ...(view.proposals ? { proposals: view.proposals } : {}),
        });
        if (theme === "dark") {
          await page.goto(PATH);
          await switchToDark(page);
        }
        await page.goto(view.path);
        await view.visible(page);
        await expect(header(page).locator("[data-slot='deliverable-status']")).toHaveAttribute(
          "data-status",
          view.status,
        );
        await expect(page.locator("html")).toHaveClass(
          theme === "dark" ? /dark/ : /^((?!dark).)*$/,
        );
        if (view.singleStatus) await expect(page.getByRole("status")).toHaveCount(1);
        await settle(page);
        await page.screenshot({
          path: `${CAPTURES_DIR}/S-spec-functional/${view.name}-${theme}${viewport.name}.png`,
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

test("S-spec-functional : une fiche refermée rend le focus à la ligne ; « Liste » ferme la fiche sous 1024 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await setScenario({ session: true, projects: "data", proposals: "none" });
  await page.goto(`${PATH}?sel=F-001`);
  const fiche = page.getByRole("complementary", { name: FICHE });
  await expect(fiche).toBeVisible();
  const box = await fiche.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(370);
  await fiche.getByRole("button", { name: "Fermer la fiche" }).click();
  await expect(fiche).toHaveCount(0);
  await expect(page.locator("[data-feature-link='F-001']")).toBeFocused();
});
