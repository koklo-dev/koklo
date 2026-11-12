import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  AXE_TAGS,
  CAPTURES_DIR,
  setScenario,
  settle,
  switchToDark,
  type Theme,
} from "./support/helpers.ts";
import { FEATURE_PROJECT_ID } from "./support/stub-features.ts";

/**
 * TK-105 lot C, vue client en volume réel (planche « Volume réel » : 248 fonctionnalités, 86 règles, 18 parcours ;
 * maquette 10 l.485-501, 820). Le faux API filtre par `q` sur tout l'index, comme le serveur (B364). Clair, sombre et
 * 375 px, axe sans violation, y compris après une décision. Pile locale : faux API.
 * Captures dans design/screens/captures/S-spec-functional/client-volume-<état>-<thème>[-mobile].png.
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
  tab: string;
  prepare: (page: Page) => Promise<void>;
}

const VIEWS: View[] = [
  {
    name: "features",
    tab: "features",
    prepare: async (page) => {
      await expect(page.getByText(/248 fonctionnalités/).first()).toBeVisible();
      await expect(page.getByText(/50 chargées/).first()).toBeVisible();
    },
  },
  {
    name: "rules-search-empty",
    tab: "rules",
    prepare: async (page) => {
      await page
        .getByRole("searchbox", { name: "Rechercher une règle ou R-nnn" })
        .fill("introuvable-xyz");
      await expect(
        page.getByText("Aucune règle ne correspond à « introuvable-xyz »"),
      ).toBeVisible();
    },
  },
  {
    name: "flows",
    tab: "flows",
    prepare: async (page) => {
      await expect(page.getByText(/18 parcours/).first()).toBeVisible();
      await expect(page.getByText(/6 chargés/).first()).toBeVisible();
    },
  },
  {
    name: "after-decision",
    tab: "features",
    prepare: async (page) => {
      await page.getByRole("button", { name: /F-001/ }).click();
      await expect(page.getByRole("complementary", { name: FICHE })).toBeVisible();
      await page.getByRole("button", { name: "Valider", exact: true }).click();
      await expect(
        page.getByRole("status").filter({ hasText: "Validée. Suivante : F-002" }),
      ).toBeAttached();
    },
  },
];

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const view of VIEWS) {
      test(`S-spec-functional client-volume-${view.name} (${theme}${viewport.name}) : état, axe sans violation, capture`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await setScenario({
          session: true,
          projects: "data",
          role: "client",
          clientSpace: "large",
        });
        if (theme === "dark") {
          await page.goto(PATH);
          await switchToDark(page);
        }
        await page.goto(`${PATH}?tab=${view.tab}`);
        await view.prepare(page);
        await settle(page);
        await page.screenshot({
          path: `${CAPTURES_DIR}/S-spec-functional/client-volume-${view.name}-${theme}${viewport.name}.png`,
          fullPage: true,
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        ).toBeLessThanOrEqual(0);
        const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(results.violations, JSON.stringify(results.violations.map((v) => v.id))).toEqual([]);
      });
    }
  }
}

test("client : la recherche d'une règle hors de la première page interroge tout l'index", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data", role: "client", clientSpace: "large" });
  await page.goto(`${PATH}?tab=rules`);
  await expect(page.getByText(/86 règles/).first()).toBeVisible();
  await expect(page.getByText(/24 chargées/).first()).toBeVisible();
  await expect(page.getByText("R-080", { exact: true })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Rechercher une règle ou R-nnn" }).fill("R-080");
  await expect(page.getByText("R-080", { exact: true })).toBeVisible();
  await expect(page.getByText(/1 règle/).first()).toBeVisible();
});

test("client : l'en-tête et les onglets disent 248, jamais la longueur des 50 lignes chargées", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data", role: "client", clientSpace: "large" });
  await page.goto(`${PATH}?tab=features`);
  await expect(page.getByText(/248/).first()).toBeVisible();
  await expect(page.getByText(/50 chargées/).first()).toBeVisible();
  await expect(page.getByText(/\b50 fonctionnalités\b/)).toHaveCount(0);
});
