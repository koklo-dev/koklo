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
import { FEATURE_PROJECT_ID, type SpecMode } from "./support/stub-features.ts";
import type { ProposalsMode } from "./support/stub-proposals.ts";

/**
 * TK-103 lot B, onglets Règles métier, Rôles et permissions et Parcours du cahier fonctionnel
 * (design/screens/S-spec-functional.md v2, maquette 10 l.225-295, 335-382) : chaque état de chaque onglet en clair, sombre
 * et à 375 px, avec axe et sans défilement horizontal de page. Pile locale : faux API (support/stub-spec-domain.ts).
 * Captures dans design/screens/captures/S-spec-functional/<état>-<thème>[-mobile].png.
 */
const PATH = `/projects/${FEATURE_PROJECT_ID}/spec/functional`;
const VIEWPORTS = [
  { name: "", width: 1280, height: 800 },
  { name: "-mobile", width: 375, height: 800 },
] as const;
const THEMES: Theme[] = ["light", "dark"];
const header = (page: Page) => page.locator("[data-slot='project-header']");
const dialogOf = (page: Page) => page.getByRole("dialog");

interface View {
  name: string;
  spec?: SpecMode;
  proposals?: ProposalsMode;
  role?: KanbanRole;
  path: string;
  visible: (page: Page) => Promise<void>;
  /** Une seule région `role=status` dans le document. */
  singleStatus?: boolean;
  /** Ouvre un panneau avant la capture. */
  after?: (page: Page) => Promise<void>;
}

const VIEWS: View[] = [
  {
    name: "rules-list",
    path: `${PATH}?tab=rules`,
    singleStatus: true,
    visible: async (page) => {
      await expect(page.getByRole("heading", { name: "Cycle d'une réservation" })).toBeVisible();
      await expect(page.getByRole("list", { name: "États de la règle" })).toBeVisible();
    },
  },
  {
    name: "rules-large",
    spec: "large",
    path: `${PATH}?tab=rules`,
    singleStatus: true,
    visible: async (page) => {
      await expect(page.locator("[data-slot='count-bar']")).toContainText(
        "300 règles · 24 chargées",
      );
      await expect(page.locator("[data-slot='rule-card']")).toHaveCount(24);
    },
  },
  {
    name: "rules-search-empty",
    path: `${PATH}?tab=rules&q=introuvable`,
    singleStatus: true,
    visible: async (page) => {
      await expect(page.locator("[data-slot='empty-state']")).toContainText(
        "Aucune règle ne correspond à « introuvable »",
      );
    },
  },
  {
    name: "rules-form",
    path: `${PATH}?tab=rules&edit=R-002`,
    visible: async (page) => {
      await expect(dialogOf(page).getByRole("textbox", { name: /^Titre/ })).toHaveValue(
        "Délai d'annulation",
      );
    },
  },
  {
    name: "roles-list",
    path: `${PATH}?tab=roles`,
    singleStatus: true,
    visible: async (page) => {
      await expect(page.getByRole("table", { name: "Qui peut faire quoi" })).toBeVisible();
      await expect(page.locator("[data-slot='role-card']")).toHaveCount(3);
    },
  },
  {
    name: "roles-large",
    spec: "large",
    path: `${PATH}?tab=roles`,
    singleStatus: true,
    visible: async (page) => {
      await expect(page.locator("[scope='rowgroup']")).toHaveCount(8);
      await expect(page.getByRole("table")).toContainText("47 actions");
    },
  },
  {
    name: "roles-form",
    path: `${PATH}?tab=roles&new=1`,
    visible: async (page) => {
      await expect(dialogOf(page).getByRole("heading", { name: "Nouveau rôle" })).toBeVisible();
    },
  },
  {
    name: "flows-list",
    path: `${PATH}?tab=flows`,
    singleStatus: true,
    visible: async (page) => {
      await expect(page.getByRole("heading", { name: "Réserver un rendez-vous" })).toBeVisible();
      await expect(page.locator("[data-slot='flow-error']")).toHaveCount(3);
    },
  },
  {
    name: "flows-large",
    spec: "large",
    path: `${PATH}?tab=flows`,
    singleStatus: true,
    visible: async (page) => {
      await expect(page.locator("[data-slot='count-bar']")).toContainText(
        "18 parcours · 6 chargés",
      );
    },
  },
  {
    name: "flows-form",
    path: `${PATH}?tab=flows&edit=P-annuler`,
    visible: async (page) => {
      await expect(dialogOf(page).getByRole("textbox", { name: /^Étapes/ })).toHaveValue(
        "Annuler ou déplacer · S-annulation\nConfirmation · S-confirmation",
      );
    },
  },
  {
    name: "review-features",
    proposals: "mixed",
    path: `${PATH}?tab=features&view=review`,
    singleStatus: true,
    visible: async (page) => {
      await expect(page.getByRole("region", { name: "Relecture des propositions" })).toBeVisible();
    },
  },
  {
    name: "review-rules",
    proposals: "mixed",
    path: `${PATH}?tab=rules&view=review`,
    singleStatus: true,
    visible: async (page) => {
      await expect(page.getByText("Règle · workflow à états")).toBeVisible();
      await expect(page.getByRole("list", { name: "États de la règle" })).toBeVisible();
    },
  },
  {
    name: "review-roles",
    proposals: "mixed",
    path: `${PATH}?tab=roles&view=review`,
    singleStatus: true,
    visible: async (page) => {
      await expect(page.getByText("Rôle · 3 permissions")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Permissions" })).toBeVisible();
    },
  },
  {
    name: "review-flows",
    proposals: "mixed",
    path: `${PATH}?tab=flows&view=review`,
    singleStatus: true,
    visible: async (page) => {
      await expect(page.getByText("Parcours · 3 étapes")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Étapes" })).toBeVisible();
    },
  },
  {
    name: "generating-rules",
    proposals: "generating",
    path: `${PATH}?tab=rules&view=review`,
    singleStatus: true,
    visible: async (page) => {
      await expect(page.getByText("L'agent rédige le cahier fonctionnel")).toBeVisible();
    },
  },
];

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const view of VIEWS) {
      test(`S-spec-functional ${view.name} (${theme}${viewport.name}) : état, axe sans violation, capture`, async ({
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
        await expect(page.locator("html")).toHaveClass(
          theme === "dark" ? /dark/ : /^((?!dark).)*$/,
        );
        if (view.singleStatus) await expect(page.getByRole("status")).toHaveCount(1);
        await view.after?.(page);
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

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
test.describe("parcours des onglets", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setScenario({ session: true, projects: "data", spec: "large", proposals: "none" });
  });

  test("les onglets sont des liens avec leur compteur ; on passe de l'un à l'autre", async ({
    page,
  }) => {
    await page.goto(`${PATH}?tab=rules`);
    const tabs = page.getByRole("navigation", { name: "Sections du cahier fonctionnel" });
    await expect(tabs.getByRole("link", { name: /^Règles métier/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(tabs.getByRole("link", { name: /^Règles métier/ })).toContainText("300");
    await expect(tabs.getByRole("link", { name: /^Parcours/ })).toContainText("18");
    await tabs.getByRole("link", { name: /^Rôles et permissions/ }).click();
    await expect(page.getByRole("table", { name: "Qui peut faire quoi" })).toBeVisible();
    await expect(page).toHaveURL(/tab=roles/);
  });

  test("300 règles : pages de 24, « Charger la suite », recherche et type sur des éléments non chargés", async ({
    page,
  }) => {
    await page.goto(`${PATH}?tab=rules`);
    await expect(page.locator("[data-slot='rule-card']")).toHaveCount(24);
    await page.getByRole("button", { name: "Charger la suite" }).click();
    await expect(page.locator("[data-slot='rule-card']")).toHaveCount(48);
    await page.getByRole("searchbox", { name: "Rechercher une règle ou R-nnn" }).fill("R-250");
    await expect(page.locator("[data-slot='rule-card']")).toHaveCount(1);
    await expect(page.locator("[data-spec-id='R-250']")).toBeVisible();
    await page.getByRole("searchbox", { name: "Rechercher une règle ou R-nnn" }).fill("");
    await page.getByRole("button", { name: "Workflow à états" }).click();
    await expect(page).toHaveURL(/type=workflow/);
    await expect(page.getByRole("button", { name: "Workflow à états" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("lien direct ?sel=R-250 : la page qui contient la règle, carte choisie et visible", async ({
    page,
  }) => {
    await page.goto(`${PATH}?tab=rules&sel=R-250`);
    const card = page.locator("[data-spec-id='R-250']");
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("button", { name: "Charger les précédentes" })).toBeVisible();
  });

  test("matrice : groupes au-delà de 20 actions, ouverts sous 5, chevron au clavier", async ({
    page,
  }) => {
    await page.goto(`${PATH}?tab=roles`);
    const closed = page.getByRole("button", { name: /Paiement et caisse/ });
    await expect(closed).toHaveAttribute("aria-expanded", "false");
    await closed.focus();
    await page.keyboard.press("Enter");
    await expect(closed).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByRole("rowheader", { name: /Créer · paiement et caisse/ }).first(),
    ).toBeVisible();
    const region = page.getByRole("region", { name: "Qui peut faire quoi, défilement horizontal" });
    await expect(region).toHaveAttribute("tabindex", "0");
    await page.keyboard.press("/");
    await expect(page.getByRole("searchbox", { name: "Filtrer les actions" })).toBeFocused();
  });

  test("375 px : grille à une colonne, étapes en colonne, matrice défilante dans son cadre", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${PATH}?tab=rules`);
    const cards = page.locator("[data-slot='rule-card']");
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    expect(second?.y ?? 0).toBeGreaterThan(first?.y ?? 0);
    expect(Math.abs((second?.x ?? 0) - (first?.x ?? 1))).toBeLessThan(2);
    await page.goto(`${PATH}?tab=flows`);
    const steps = page.locator("[data-slot='flow-steps']").first().getByRole("listitem");
    const a = await steps.nth(0).boundingBox();
    const b = await steps.nth(1).boundingBox();
    expect(b?.y ?? 0).toBeGreaterThan((a?.y ?? 0) + (a?.height ?? 0) - 1);
    await page.goto(`${PATH}?tab=roles`);
    const region = page.getByRole("region", { name: "Qui peut faire quoi, défilement horizontal" });
    expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });

  test("« Nouvelle règle » : Échap ferme la feuille et rend le focus au bouton d'origine", async ({
    page,
  }) => {
    await page.goto(`${PATH}?tab=rules`);
    const button = header(page).getByRole("button", { name: "Nouvelle règle" });
    await button.click();
    await expect(dialogOf(page).getByRole("heading", { name: "Nouvelle règle" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialogOf(page)).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test("« Nouveau rôle » : enregistrement, toast, rôle choisi dans l'adresse (?sel=)", async ({
    page,
  }) => {
    await page.goto(`${PATH}?tab=roles`);
    await header(page).getByRole("button", { name: "Nouveau rôle" }).click();
    const dialog = dialogOf(page);
    await dialog.getByRole("textbox", { name: /^Nom/ }).fill("Stagiaire");
    await dialog
      .getByRole("textbox", { name: /^Description/ })
      .fill("Voit l'agenda, sans pouvoir le modifier.");
    await dialog.getByRole("combobox", { name: "Permissions : ajouter" }).fill("PM-agenda.lire");
    await page.keyboard.press("Enter");
    await dialog.getByRole("button", { name: "Enregistrer dans la spec" }).click();
    await expect(page.getByText(/RL-stagiaire enregistré dans la spec/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page).toHaveURL(/sel=RL-stagiaire/);
    await expect(dialogOf(page)).toHaveCount(0);
  });

  test("le designer écrit les parcours, pas les règles ni les rôles (B340)", async ({ page }) => {
    await setScenario({ session: true, projects: "data", role: "designer", proposals: "none" });
    await page.goto(`${PATH}?tab=rules`);
    await expect(page.getByRole("heading", { name: "Cycle d'une réservation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nouvelle règle" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Modifier R-/ })).toHaveCount(0);
    await page.goto(`${PATH}?tab=flows`);
    await expect(header(page).getByRole("button", { name: "Nouveau parcours" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Modifier P-reserver" })).toBeVisible();
  });

  test("le client ne voit ni bouton d'ajout ni bouton de modification", async ({ page }) => {
    await setScenario({ session: true, projects: "data", role: "client", proposals: "none" });
    await page.goto(`${PATH}?tab=rules`);
    await expect(page.getByRole("heading", { name: "Cycle d'une réservation" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Nouvelle règle|^Modifier R-/ })).toHaveCount(0);
  });

  test("relecture : un onglet relit son type, les autres gardent leur compteur « N à relire »", async ({
    page,
  }) => {
    await setScenario({ session: true, projects: "data", proposals: "mixed" });
    await page.goto(`${PATH}?tab=roles&view=review`);
    const tabs = page.getByRole("navigation", { name: "Sections du cahier fonctionnel" });
    await expect(tabs.getByRole("link", { name: /^Rôles et permissions/ })).toContainText(
      "1 à relire",
    );
    await expect(tabs.getByRole("link", { name: /^Fonctionnalités/ })).toContainText("3 à relire");
    await expect(page.getByRole("button", { name: /Accueil/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Délai d'annulation/ })).toHaveCount(0);
    await tabs.getByRole("link", { name: /^Règles métier/ }).click();
    await expect(page.getByRole("button", { name: /Délai d'annulation/ })).toBeVisible();
  });
});
