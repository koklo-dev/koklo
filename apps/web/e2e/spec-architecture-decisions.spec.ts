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
import type { ArchState } from "./support/stub-architecture-decisions.ts";
import { FEATURE_PROJECT_ID } from "./support/stub-features.ts";

/**
 * TK-113 lot B, écran Architecture (design/screens/S-spec-architecture.md v4 §12, maquette 13 l.122-137, 376-401) :
 * onglet Décisions (liste, fiche, filtres, lien direct, vide), « Valider l'architecture », état À revoir (bandeau,
 * contours ambre), vue client en lecture seule (« En clair », « Commenter »). Captures, clair, sombre et 375 px, dans
 * design/screens/captures/S-spec-architecture/<état>-<thème>[-mobile].png. Faux API : support/stub-architecture-decisions.ts.
 */
const PATH = `/projects/${FEATURE_PROJECT_ID}/spec/architecture`;
const VIEWPORTS = [
  { name: "", width: 1280, height: 900 },
  { name: "-mobile", width: 375, height: 800 },
] as const;
const THEMES: Theme[] = ["light", "dark"];
const LIST = (page: Page) => page.getByRole("region", { name: "Décisions de l'architecture" });

const decisionsLoaded = async (page: Page) => {
  await expect(LIST(page)).toBeVisible();
  await expect(page.getByText("ADR-018").first()).toBeVisible();
};

interface View {
  name: string;
  archState: ArchState;
  role?: KanbanRole;
  path: string;
  visible: (page: Page) => Promise<void>;
  desktopOnly?: boolean;
}

const VIEWS: View[] = [
  {
    name: "decisions",
    archState: "pending",
    path: `${PATH}?tab=decisions`,
    visible: decisionsLoaded,
  },
  {
    name: "decisions-fiche",
    archState: "pending",
    path: `${PATH}?tab=decisions&d=ADR-018`,
    visible: async (page) => {
      await expect(page.getByRole("article", { name: "Décision" })).toBeVisible();
    },
  },
  {
    name: "decisions-vide",
    archState: "pending",
    path: `${PATH}?tab=decisions&q=introuvable`,
    visible: async (page) => {
      await expect(
        page.getByText("Aucune décision ne correspond à « introuvable »").first(),
      ).toBeVisible();
    },
  },
  {
    name: "a-revoir",
    archState: "revise",
    path: `${PATH}?tab=components`,
    visible: async (page) => {
      await expect(page.getByRole("alert").filter({ hasText: "Sont concernés" })).toContainText(
        "C-api, C-worker",
      );
      await expect(page.getByRole("button", { name: "Voir les changements" })).toBeVisible();
    },
  },
  {
    name: "a-revoir-schema",
    archState: "revise",
    path: `${PATH}?tab=schema`,
    desktopOnly: true,
    visible: async (page) => {
      await expect(page.getByRole("button", { name: "Service API, à revoir" })).toBeVisible();
    },
  },
  {
    name: "valide",
    archState: "validated",
    path: `${PATH}?tab=decisions`,
    visible: async (page) => {
      await expect(page.getByText("Validé par Moussa le 5 nov. · version 8f2d41c")).toBeVisible();
    },
  },
  {
    name: "client-decisions",
    archState: "validated",
    role: "client",
    path: `${PATH}?tab=decisions&d=ADR-018`,
    visible: async (page) => {
      await expect(page.getByRole("note")).toContainText("Lecture seule.");
      await expect(page.getByText("En clair")).toBeVisible();
    },
  },
  {
    name: "client-composants",
    archState: "validated",
    role: "client",
    path: `${PATH}?tab=components`,
    visible: async (page) => {
      await expect(page.getByRole("table", { name: "Composants de l'architecture" })).toBeVisible();
    },
  },
  {
    name: "client-schema",
    archState: "validated",
    role: "client",
    path: `${PATH}?tab=schema`,
    desktopOnly: true,
    visible: async (page) => {
      await expect(page.getByRole("button", { name: "Service API" })).toBeVisible();
    },
  },
  {
    name: "client-non-valide",
    archState: "pending",
    role: "client",
    path: PATH,
    visible: async (page) => {
      await expect(page.getByText("L'architecture n'est pas encore validée")).toBeVisible();
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
          architecture: "demo",
          archState: view.archState,
          ...(view.role ? { role: view.role } : {}),
          proposals: "none",
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
        const found = results.violations.map((v) => [v.id, v.nodes.map((n) => String(n.target))]);
        expect(found, JSON.stringify(found)).toEqual([]);
        await releaseHeld();
      });
    }
  }
}

const start = async (page: Page, archState: ArchState, role?: KanbanRole) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setScenario({
    session: true,
    projects: "data",
    installations: "single",
    architecture: "demo",
    archState,
    proposals: "none",
    ...(role ? { role } : {}),
  });
};

const commentsSeen = async (): Promise<unknown[]> =>
  (await fetch(`http://127.0.0.1:${process.env.E2E_API_PORT ?? 3101}/__arch-comments`)).json();

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
test.describe("parcours Décisions, validation et vue client", () => {
  test("Décisions : compte par statut, filtre de statut dans l'adresse, fiche d'une décision remplacée", async ({
    page,
  }) => {
    await start(page, "pending");
    await page.goto(`${PATH}?tab=decisions`);
    await decisionsLoaded(page);
    await expect(page.getByText(/19 acceptées · 3 proposées/)).toBeVisible();
    await page.getByRole("button", { name: "Statut" }).click();
    await page.getByRole("menuitemradio", { name: /Proposée/ }).click();
    await expect(page).toHaveURL(/status=proposee/);
    await expect(LIST(page).getByRole("button")).toHaveCount(3);
    await page.goto(`${PATH}?tab=decisions&d=ADR-004`);
    await expect(page.getByText("Remplacée par ADR-018 le 29 oct.")).toBeVisible();
  });

  test("lien direct ?d= et recherche : la décision s'ouvre, la recherche filtre", async ({
    page,
  }) => {
    await start(page, "pending");
    await page.goto(`${PATH}?tab=decisions&d=ADR-021`);
    await expect(page.getByRole("article", { name: "Décision" })).toContainText("ADR-021");
    await page.getByRole("searchbox", { name: "Rechercher une décision" }).fill("ADR-005");
    await expect(page).toHaveURL(/q=ADR-005/);
    await expect(LIST(page).getByRole("button")).toHaveCount(1);
  });

  test("owner : « Valider l'architecture » pose la décision, le bouton disparaît, « Validé par Moussa »", async ({
    page,
  }) => {
    await start(page, "pending");
    await page.goto(`${PATH}?tab=decisions`);
    await page.getByRole("button", { name: "Valider l'architecture" }).click();
    await expect(page.getByText("Validé par Moussa le 5 nov. · version 8f2d41c")).toBeVisible();
    await expect(page.getByRole("button", { name: "Valider l'architecture" })).toHaveCount(0);
  });

  test("designer : lit les décisions sans Valider ni Modifier", async ({ page }) => {
    await start(page, "pending", "designer");
    await page.goto(`${PATH}?tab=decisions`);
    await decisionsLoaded(page);
    await expect(
      page.getByRole("button", { name: /Valider|Modifier|Nouvelle décision/ }),
    ).toHaveCount(0);
  });

  test("À revoir : le schéma surligne API et Worker ; « Voir les changements » ouvre l'écran amont sur le premier élément", async ({
    page,
  }) => {
    await start(page, "revise");
    await page.goto(`${PATH}?tab=schema`);
    await expect(page.getByRole("button", { name: "Service API, à revoir" })).toBeVisible();
    await page.getByRole("button", { name: "Voir les changements" }).click();
    await expect(page).toHaveURL(/spec\/functional\?tab=features&sel=F-002/);
  });

  test("client : « Commenter » une décision, Échap ferme et rend le focus, envoi enregistré", async ({
    page,
  }) => {
    await start(page, "validated", "client");
    await page.goto(`${PATH}?tab=decisions&d=ADR-018`);
    const open = page
      .getByRole("article", { name: "Décision" })
      .getByRole("button", { name: "Commenter" });
    await open.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();
    await open.click();
    await page
      .getByRole("textbox", { name: "Votre commentaire" })
      .fill("Pourquoi un seul composant ?");
    await page.getByRole("button", { name: "Envoyer" }).click();
    await expect(page.getByText("Commentaire envoyé")).toBeAttached();
    expect(await commentsSeen()).toEqual([
      expect.objectContaining({ targetKind: "adr", targetRef: "ADR-018" }),
    ]);
  });

  test("client : l'API d'équipe n'est jamais appelée et le Document n'existe pas", async ({
    page,
  }) => {
    await start(page, "validated", "client");
    const teamCalls: string[] = [];
    page.on("request", (request) => {
      if (/\/spec\/architecture\//.test(request.url())) teamCalls.push(request.url());
    });
    await page.goto(`${PATH}?tab=components`);
    await expect(page.getByRole("table", { name: "Composants de l'architecture" })).toBeVisible();
    expect(teamCalls).toEqual([]);
    await expect(page.getByRole("link", { name: /Document/ })).toHaveCount(0);
  });
});
