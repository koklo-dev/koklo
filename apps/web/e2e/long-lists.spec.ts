import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  AXE_TAGS,
  CAPTURES_DIR,
  releaseHeld,
  setScenario,
  settle,
  specReadsSeen,
  switchToDark,
  type Theme,
  ticketReadsSeen,
  transitionsSeen,
} from "./support/helpers.ts";
import { FEATURE_PROJECT_ID, type SpecMode } from "./support/stub-features.ts";
import { type BoardMode, largeTodoKeys } from "./support/stub-kanban.ts";

/**
 * TK-94 lot C, listes longues (design/screens/S-features.md 1.7, S-kanban.md 1.2, 02-design.md §8) :
 * liste de 1 000 fonctionnalités virtualisée, recherche, lien direct, pieds de liste, kanban par colonne.
 * Pile locale : faux API (support/stub-features.ts, stub-kanban.ts). Captures dans
 * design/screens/captures/S-features/ et S-kanban/, en clair, en sombre et à 375 px.
 */
const PATH = `/projects/${FEATURE_PROJECT_ID}/features`;
const VIEWPORTS = [
  { name: "", width: 1280, height: 800 },
  { name: "-mobile", width: 375, height: 800 },
] as const;
const THEMES: Theme[] = ["light", "dark"];
type Viewport = (typeof VIEWPORTS)[number];

const list = (page: Page) => page.getByRole("list", { name: "Fonctionnalités" });
const footer = (page: Page) => page.locator("[data-slot='list-footer']");
const search = (page: Page) => page.getByRole("searchbox", { name: /Rechercher/ });

interface View {
  name: string;
  spec?: SpecMode;
  path: string;
  /** Action après le chargement. */
  after?: (page: Page) => Promise<void>;
  visible: (page: Page) => Promise<void>;
  /**
   * Observateur d'intersection neutralisé : le défilement jusqu'au pied déclenche sinon aussitôt la page
   * suivante (règle des 80 %). Le bouton « Charger la suite » reste le repli ; sert à figer l'état « more ».
   */
  freezeObserver?: boolean;
  /** Pied de liste capturé à part (défilé au bas de la liste). */
  footer?: boolean;
}

const VIEWS: View[] = [
  {
    name: "list-continue",
    spec: "large",
    path: PATH,
    freezeObserver: true,
    footer: true,
    visible: async (page) => {
      await expect(footer(page)).toHaveAttribute("data-state", "more");
      await expect(page.locator("[data-slot='count-bar']")).toContainText(
        "1 000 fonctionnalités · 50 chargées",
      );
    },
  },
  {
    name: "list-loading-more",
    spec: "largeMoreSlow",
    path: PATH,
    footer: true,
    after: async (page) => {
      await page.getByRole("button", { name: "Charger la suite" }).click();
    },
    visible: (page) => expect(footer(page)).toContainText("Chargement des 50 suivantes…"),
  },
  {
    name: "list-error-more",
    spec: "largeMoreError",
    path: PATH,
    footer: true,
    after: async (page) => {
      await page.getByRole("button", { name: "Charger la suite" }).click();
    },
    visible: (page) =>
      expect(footer(page)).toContainText(
        "Impossible de charger la suite. Les 50 premières restent affichées.",
      ),
  },
  {
    name: "list-end",
    spec: "large",
    path: `${PATH}?status=adoptee&priority=wont`,
    footer: true,
    after: async (page) => {
      await page.getByRole("button", { name: "Charger la suite" }).click();
    },
    visible: async (page) => {
      await expect(footer(page)).toHaveAttribute("data-state", "end");
      await expect(footer(page)).toContainText(/Fin de la liste · \d+ fonctionnalités/);
      await expect(footer(page).getByRole("button", { name: "Revenir en haut" })).toBeVisible();
    },
  },
  {
    name: "list-search-empty",
    spec: "large",
    path: `${PATH}?q=annulation%20group%C3%A9e`,
    visible: async (page) => {
      await expect(page.locator("[data-slot='empty-state']")).toContainText(
        "Aucune fonctionnalité ne correspond à « annulation groupée »",
      );
      await expect(page.getByRole("button", { name: "Effacer la recherche" })).toBeVisible();
    },
  },
  {
    name: "list-search-results",
    spec: "large",
    path: `${PATH}?q=r%C3%A9siliation`,
    visible: async (page) => {
      await expect(page.locator("[data-slot='count-bar']")).toContainText("12 fonctionnalités");
      await expect(list(page).getByRole("listitem")).toHaveCount(12);
    },
  },
  {
    name: "list-sel-deep",
    spec: "large",
    path: `${PATH}?sel=F-187`,
    visible: async (page) => {
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(
        page.locator("[data-row-key='F-187']", { hasText: "Résiliation d'abonnement 187" }),
      ).toHaveAttribute("aria-current", "true", { timeout: 10_000 });
    },
  },
];

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Pied de liste : défilé au bas, stable (erreur persistante), mis en page en ligne comme la planche 12. */
async function captureFooter(page: Page, view: View, theme: Theme, viewport: Viewport) {
  const foot = footer(page);
  await foot.scrollIntoViewIfNeeded();
  await expect(foot).toBeInViewport();
  const box = await foot.boundingBox();
  if (viewport.width >= 768 && view.name !== "list-loading-more") {
    // Planche 12 : une ligne (55 px) ; marge pour la police et la ligne de bouton.
    expect(box?.height ?? 0).toBeLessThan(72);
  }
  const button = foot.getByRole("button").first();
  if ((await button.count()) > 0 && viewport.width < 768) {
    expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await settle(page);
  await page.screenshot({
    path: `${CAPTURES_DIR}/S-features/${view.name}-foot-${theme}${viewport.name}.png`,
  });
}

async function capture(page: Page, folder: string, name: string, theme: Theme, suffix: string) {
  await settle(page);
  await page.screenshot({
    path: `${CAPTURES_DIR}/${folder}/${name}-${theme}${suffix}.png`,
    fullPage: true,
  });
}

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const view of VIEWS) {
      test(`S-features ${view.name} (${theme}${viewport.name}) : état visible, axe sans violation, capture`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await setScenario({
          session: true,
          projects: "data",
          installations: "single",
          ...(view.spec ? { spec: view.spec } : {}),
        });
        if (view.freezeObserver) {
          await page.addInitScript(() => {
            window.IntersectionObserver = class {
              observe() {}
              unobserve() {}
              disconnect() {}
              takeRecords() {
                return [];
              }
            } as unknown as typeof IntersectionObserver;
          });
        }
        if (theme === "dark") {
          // La bascule de thème vit dans le menu de la page : elle se fait avant une éventuelle fiche ouverte.
          await page.goto(PATH);
          await switchToDark(page);
        }
        await page.goto(view.path);
        await expect(
          page.locator("[data-slot='virtual-list'], [data-slot='empty-state']"),
        ).toBeVisible();
        if (view.after) await view.after(page);
        await view.visible(page);
        await expect(page.locator("html")).toHaveClass(
          theme === "dark" ? /dark/ : /^((?!dark).)*$/,
        );
        await capture(page, "S-features", view.name, theme, viewport.name);
        if (view.footer) {
          await captureFooter(page, view, theme, viewport);
          await view.visible(page);
        }
        await noHorizontalScroll(page);
        const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(results.violations, JSON.stringify(results.violations.map((v) => v.id))).toEqual([]);
        await releaseHeld();
      });
    }
  }
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
test.describe("Liste des fonctionnalités : 1 000 éléments", () => {
  test.beforeEach(async ({ page }) => {
    await setScenario({ session: true, projects: "data", installations: "single", spec: "large" });
    await page.goto(PATH);
    await expect(list(page)).toBeVisible();
  });

  test("jamais plus de 80 lignes dans le DOM, aria-setsize = 1 000", async ({ page }) => {
    const rows = list(page).getByRole("listitem");
    expect(await rows.count()).toBeLessThanOrEqual(80);
    await expect(rows.first()).toHaveAttribute("aria-setsize", "1000");
    await expect(rows.first()).toHaveAttribute("aria-posinset", "1");
  });

  test("le défilement à 80 % charge la page suivante sans clic", async ({ page }) => {
    const before = (await specReadsSeen()).filter((read) => read.includes("cursor")).length;
    await page.locator("[data-slot='virtual-list']").evaluate((el) => {
      el.scrollTop = el.scrollHeight * 0.9;
    });
    await expect
      .poll(async () => (await specReadsSeen()).filter((read) => read.includes("cursor")).length)
      .toBe(before + 1);
    await expect(page.locator("[data-slot='count-bar']")).toContainText("100 chargées");
    expect(await list(page).getByRole("listitem").count()).toBeLessThanOrEqual(80);
  });

  test("clavier : Tab atteint une seule ligne, Entrée ouvre la fiche, Échap rend le focus", async ({
    page,
  }) => {
    await search(page).focus();
    await page.keyboard.press("Tab"); // Statut
    await page.keyboard.press("Tab"); // Priorité
    await page.keyboard.press("Tab"); // première ligne de la liste
    const first = list(page).getByRole("listitem").first();
    await expect(first).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(list(page).getByRole("listitem").nth(1)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    // Le focus revient au lien de la ligne ouverte ; les flèches continuent d'y fonctionner (l'événement remonte à la ligne).
    await expect(page.locator("[data-feature-link='F-002']")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(list(page).getByRole("listitem").nth(2)).toBeFocused();
  });

  test("« Charger la suite » est atteignable à la touche Tab et s'active à Entrée", async ({
    page,
  }) => {
    const button = page.getByRole("button", { name: "Charger la suite" });
    await search(page).focus();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      if (await button.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(button).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-slot='count-bar']")).toContainText("100 chargées");
  });

  test("la recherche porte sur les 1 000 fonctionnalités et s'écrit dans l'adresse", async ({
    page,
  }) => {
    await search(page).fill("résiliation");
    await expect(page.locator("[data-slot='count-bar']")).toContainText("12 fonctionnalités");
    await expect(page).toHaveURL(/q=r%C3%A9siliation/);
    await expect(page.getByRole("status")).toContainText("12 fonctionnalités trouvées sur 1 000");
  });

  test("lien direct hors des filtres : note neutre et « Effacer les filtres »", async ({
    page,
  }) => {
    await page.goto(`${PATH}?sel=F-187&status=adoptee`);
    // La fiche modale s'ouvre d'abord ; l'avis, derrière elle, apparaît à sa fermeture.
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    const note = page
      .getByRole("note")
      .filter({ hasText: "n'apparaît pas avec les filtres actuels" });
    await expect(note).toBeVisible();
    await note.getByRole("button", { name: "Effacer les filtres" }).click();
    await expect(page).not.toHaveURL(/status=/);
  });

  test("fluidité : défilement continu de la liste sur 5 s", async ({ page }) => {
    const result = await measureScroll(page.locator("[data-slot='virtual-list']"));
    test.info().annotations.push({
      type: "fluidité",
      description: `médiane ${result.medianFps.toFixed(1)} i/s, plus long bloc ${result.longestFrameMs.toFixed(0)} ms`,
    });
    expect(result.medianFps).toBeGreaterThanOrEqual(55);
    expect(result.longestFrameMs).toBeLessThanOrEqual(100);
  });
});

/**
 * Fait défiler `target` pendant 5 s, image par image, et mesure l'intervalle entre deux `requestAnimationFrame`
 * (la première image, qui porte le démarrage de la mesure, est écartée).
 */
async function scrollOnce(target: Locator) {
  return target.evaluate(
    (el) =>
      new Promise<{ medianFps: number; longestFrameMs: number }>((resolve) => {
        const intervals: number[] = [];
        const start = performance.now();
        let last = start;
        const step = (now: number) => {
          intervals.push(now - last);
          last = now;
          el.scrollTop += 24;
          if (now - start < 5000) requestAnimationFrame(step);
          else {
            const measured = intervals.slice(1);
            const sorted = [...measured].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)] ?? 16.7;
            resolve({ medianFps: 1000 / median, longestFrameMs: Math.max(...measured) });
          }
        };
        requestAnimationFrame(step);
      }),
  );
}

/** Trois essais au plus (machine partagée, passation 07 H11) : le premier qui tient les seuils compte, le meilleur est rendu. */
async function measureScroll(target: Locator) {
  let best = await scrollOnce(target);
  for (let attempt = 1; attempt < 3 && !meetsBudget(best); attempt++) {
    await target.evaluate((el) => {
      el.scrollTop = 0;
    });
    const next = await scrollOnce(target);
    if (next.medianFps > best.medianFps) best = next;
  }
  return best;
}

const meetsBudget = (result: { medianFps: number; longestFrameMs: number }) =>
  result.medianFps >= 55 && result.longestFrameMs <= 100;

// ---------------------------------------------------------------------------------------------------------------
// Kanban

const column = (page: Page, status: string) => page.getByTestId(`kanban-column-${status}`);
const cards = (page: Page, status: string) =>
  column(page, status).locator("[data-testid^='kanban-card-']");

const BOARDS: Array<{ name: string; board: BoardMode; visible: (page: Page) => Promise<void> }> = [
  {
    name: "kanban-columns",
    board: "large",
    visible: async (page) => {
      await expect(column(page, "todo").getByLabel("142 tickets")).toBeVisible();
      await expect(cards(page, "todo")).toHaveCount(30);
      await expect(
        column(page, "todo").getByRole("button", { name: "Charger la suite · 112 restantes" }),
      ).toBeVisible();
    },
  },
  {
    name: "kanban-error-more",
    board: "largeMoreError",
    visible: async (page) => {
      await column(page, "todo")
        .getByRole("button", { name: /Charger la suite/ })
        .click();
      await expect(column(page, "todo").getByRole("alert")).toContainText(
        "Impossible de charger la suite.",
      );
    },
  },
  {
    name: "kanban-error-column",
    board: "largeColumnError",
    visible: (page) =>
      expect(column(page, "blocked").getByRole("alert")).toContainText(
        "Impossible de charger cette colonne",
      ),
  },
];

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const view of BOARDS) {
      test(`S-kanban ${view.name} (${theme}${viewport.name}) : état visible, axe sans violation, capture`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await setScenario({ session: true, projects: "data", board: view.board });
        await page.goto("/kanban");
        if (theme === "dark") await switchToDark(page);
        await expect(page.getByTestId("kanban-board")).toBeVisible();
        await view.visible(page);
        await capture(page, "S-kanban", view.name, theme, viewport.name);
        await noHorizontalScroll(page);
        const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(results.violations, JSON.stringify(results.violations.map((v) => v.id))).toEqual([]);
      });
    }
  }
}

test.describe("Kanban : sans chargement complet", () => {
  test.beforeEach(async ({ page }) => {
    await setScenario({ session: true, projects: "data", board: "large" });
    await page.goto("/kanban");
    await expect(cards(page, "todo")).toHaveCount(30);
  });

  test("à l'ouverture : une requête par colonne, 30 tickets, aucune requête enchaînée", async ({
    page,
  }) => {
    await page.waitForTimeout(500);
    const reads = await ticketReadsSeen();
    expect(reads).toHaveLength(7);
    for (const read of reads) {
      expect(read).toContain("limit=30");
      expect(read).toMatch(/^\/projects\/[0-9a-f-]{36}\/tickets\?.*status=/);
      expect(read).not.toContain("cursor=");
    }
  });

  test("le défilement de la colonne à 80 % charge la suite de cette colonne seulement", async ({
    page,
  }) => {
    const scroller = column(page, "todo").locator("[data-column-scroll]");
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight * 0.9;
    });
    await expect(cards(page, "todo")).toHaveCount(60);
    const reads = await ticketReadsSeen();
    expect(reads.filter((read) => read.includes("cursor="))).toHaveLength(1);
    expect(
      reads.filter((read) => read.includes("cursor=") && read.includes("status=todo")),
    ).toHaveLength(1);
  });

  test("« Charger la suite » au clavier, puis déplacer une carte met à jour les deux totaux", async ({
    page,
  }) => {
    const button = column(page, "todo").getByRole("button", { name: /Charger la suite/ });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(cards(page, "todo")).toHaveCount(60);
    await expect(column(page, "in_progress").getByLabel("1 ticket")).toBeVisible();
    await page.getByRole("button", { name: "Déplacer TK-104", exact: true }).click();
    await page.getByRole("menuitem", { name: "Terminé" }).click();
    await expect(column(page, "done").getByLabel("2 tickets")).toBeVisible();
    await expect(column(page, "in_progress").getByLabel("0 ticket")).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
      "TK-104 déplacé vers Terminé · Terminé : 2",
    );
    expect(await transitionsSeen()).toEqual([{ key: "TK-104", to: "done" }]);
  });

  test("fluidité : défilement continu d'une colonne de 142 tickets sur 5 s", async ({ page }) => {
    const result = await measureScroll(column(page, "todo").locator("[data-column-scroll]"));
    test.info().annotations.push({
      type: "fluidité",
      description: `médiane ${result.medianFps.toFixed(1)} i/s, plus long bloc ${result.longestFrameMs.toFixed(0)} ms`,
    });
    expect(result.medianFps).toBeGreaterThanOrEqual(55);
    expect(result.longestFrameMs).toBeLessThanOrEqual(100);
  });
});

test("B42 : l'ordre par priorité du serveur se poursuit d'une page à l'autre, sans tri local", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data", board: "large" });
  await page.goto("/kanban");
  await expect(cards(page, "todo")).toHaveCount(30);
  const keysOf = () =>
    cards(page, "todo").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-testid")?.replace("kanban-card-", "")),
    );
  const expected = largeTodoKeys();
  expect(await keysOf()).toEqual(expected.slice(0, 30));
  await column(page, "todo")
    .getByRole("button", { name: /Charger la suite/ })
    .click();
  await expect(cards(page, "todo")).toHaveCount(60);
  expect(await keysOf()).toEqual(expected.slice(0, 60));
  expect(expected[0]).not.toBe("TK-1000");
});
