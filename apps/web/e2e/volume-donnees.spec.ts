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
import { FEATURE_PROJECT_ID, type SpecMode } from "./support/stub-features.ts";
import type { ProposalsMode } from "./support/stub-proposals.ts";

/**
 * TK-110 lot B, écran Données en volume réel (design/screens/S-spec-data.md v5, maquette 11 l.171-262, 575-584) : vue des
 * zones (80 tables, 6 zones), zone ouverte, zoom 50 %, page 2 d'un jeu de 1 240 lignes, recherche sans résultat, relecture
 * groupée (67 propositions). Clair, sombre et 375 px, axe sans violation, aucun défilement horizontal de page. Pile locale :
 * faux API (support/stub-spec-data.ts, stub-proposals.ts). Captures dans
 * design/screens/captures/S-spec-data/volume-<état>-<thème>[-mobile].png.
 * (Le fichier `volume-reel.spec.ts` existant est celui de la vue client du Lot 5, TK-105.)
 */
const PATH = `/projects/${FEATURE_PROJECT_ID}/spec/data`;
const VIEWPORTS = [
  { name: "", width: 1280, height: 800 },
  { name: "-mobile", width: 375, height: 800 },
] as const;
const THEMES: Theme[] = ["light", "dark"];
const ZONE = "Prise de rendez-vous";

interface View {
  name: string;
  spec: SpecMode;
  proposals?: ProposalsMode;
  path: string;
  visible: (page: Page) => Promise<void>;
  act?: (page: Page) => Promise<void>;
  /** Capture du bureau seulement (le zoom se règle autrement sous 768 px). */
  desktopOnly?: boolean;
}

const zonesLoaded = async (page: Page) => {
  // Sous 768 px : une colonne de cartes sans lecteur (fiche §7).
  const narrow = (page.viewportSize()?.width ?? 1280) < 768;
  const region = narrow
    ? page.getByRole("list", { name: "Zones" })
    : page.getByRole("region", { name: "Diagramme par zones" });
  await expect(region).toBeVisible();
  await expect(region.getByRole("button", { name: /^Zone / })).toHaveCount(6);
  await expect(page.getByText(/^Vue des zones : 80 tables réparties en 6 zones\./)).toBeVisible();
};
const zoneOpened = async (page: Page) => {
  await expect(
    page.getByRole("region", { name: `Diagramme entité-relation, zone ${ZONE}` }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Fil du diagramme" })).toContainText(ZONE);
};
const reservations = (page: Page) =>
  page.getByRole("region", { name: "Jeu d'exemple Réservations" });

const VIEWS: View[] = [
  { name: "zones", spec: "large", path: `${PATH}?tab=diagram`, visible: zonesLoaded },
  {
    name: "zone-ouverte",
    spec: "large",
    path: `${PATH}?tab=diagram&zone=${encodeURIComponent(ZONE)}`,
    visible: zoneOpened,
  },
  {
    name: "zoom-50",
    desktopOnly: true,
    spec: "large",
    path: `${PATH}?tab=diagram&zone=${encodeURIComponent(ZONE)}`,
    visible: zoneOpened,
    act: async (page) => {
      for (let i = 0; i < 4; i += 1)
        await page.getByRole("button", { name: "Dézoomer", exact: true }).click();
      await expect(page.getByText(/Zoom sous 60 %/)).toBeVisible();
    },
  },
  {
    name: "jeu-page-2",
    spec: "large",
    path: `${PATH}?tab=fixtures`,
    visible: async (page) => {
      await expect(reservations(page).getByRole("table", { name: /Lignes du jeu/ })).toBeVisible();
    },
    act: async (page) => {
      const nav = reservations(page).getByRole("navigation", {
        name: "Pagination du jeu Réservations",
      });
      await nav.getByRole("button", { name: "Page suivante" }).click();
      await expect(nav.getByText(/26.50 sur 1.240/)).toBeVisible();
      await expect(nav.getByRole("button", { name: "Page 2" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    },
  },
  {
    name: "recherche-vide",
    spec: "large",
    path: `${PATH}?tab=diagram`,
    visible: zonesLoaded,
    act: async (page) => {
      await page.getByRole("combobox", { name: "Aller à une table" }).fill("introuvable-xyz");
      await expect(
        page.getByText("Aucune table ne correspond à « introuvable-xyz »"),
      ).toBeVisible();
    },
  },
  {
    name: "relecture-groupee",
    spec: "dataEmpty",
    proposals: "dataVolume",
    path: `${PATH}?view=review`,
    visible: async (page) => {
      await expect(page.getByRole("button", { name: `Zone ${ZONE}`, exact: true })).toBeVisible();
    },
    act: async (page) => {
      // La liste est virtuelle : le dernier groupe se rend une fois la liste défilée jusqu'à lui.
      const links = page.getByRole("button", { name: "Relations et jeux d'exemple", exact: true });
      const { width, height } = page.viewportSize() ?? { width: 1280, height: 800 };
      await page.mouse.move(width / 2, height / 2);
      await expect(async () => {
        await page.mouse.wheel(0, 3000);
        await expect(links).toBeVisible({ timeout: 400 });
      }).toPass({ timeout: 20_000 });
      await expect(
        page.getByRole("button", {
          name: "Accepter les 7 restantes de Relations et jeux d'exemple",
        }),
      ).toBeVisible();
    },
  },
];

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const view of VIEWS.filter((entry) => !entry.desktopOnly || viewport.name === "")) {
      test(`S-spec-data volume-${view.name} (${theme}${viewport.name}) : état, axe sans violation, capture`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await setScenario({
          session: true,
          projects: "data",
          installations: "single",
          spec: view.spec,
          proposals: view.proposals ?? "none",
        });
        if (theme === "dark") {
          await page.goto(PATH);
          await switchToDark(page);
        }
        await page.goto(view.path);
        await view.visible(page);
        await view.act?.(page);
        await settle(page);
        await page.screenshot({
          path: `${CAPTURES_DIR}/S-spec-data/volume-${view.name}-${theme}${viewport.name}.png`,
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

test("jeu de 1 240 lignes : taille 50 mémorisée au rechargement, page 1 à 50 lignes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setScenario({ session: true, projects: "data", spec: "large", proposals: "none" });
  await page.goto(`${PATH}?tab=fixtures`);
  const nav = reservations(page).getByRole("navigation", {
    name: "Pagination du jeu Réservations",
  });
  await nav.getByRole("button", { name: "50", exact: true }).click();
  await expect(nav.getByText(/1.50 sur 1.240/)).toBeVisible();
  await page.reload();
  const again = reservations(page).getByRole("navigation", {
    name: "Pagination du jeu Réservations",
  });
  await expect(again.getByText(/1.50 sur 1.240/)).toBeVisible();
});

test("« Aller à une table » : recherche serveur d'une table au-delà des 100 premiers noms, la zone s'ouvre", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setScenario({ session: true, projects: "data", spec: "large", proposals: "none" });
  await page.goto(`${PATH}?tab=diagram`);
  await zonesLoaded(page);
  await page.keyboard.press("/");
  const jump = page.getByRole("combobox", { name: "Aller à une table" });
  await expect(jump).toBeFocused();
  await jump.fill("Table 075");
  await page.waitForTimeout(400);
  await jump.press("Enter");
  await expect(
    page.getByRole("region", { name: /^Diagramme entité-relation, zone / }),
  ).toBeVisible();
  await expect(page).toHaveURL(/sel=T-table-075/);
});
