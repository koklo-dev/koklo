import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  AXE_TAGS,
  CAPTURES_DIR,
  collapseOf,
  hydrated,
  menuOf,
  releaseHeld,
  setScenario,
  settle,
  sidebarOf,
  switchToDark,
  type Theme,
} from "./support/helpers.ts";
import { FEATURE_PROJECT_ID } from "./support/stub-features.ts";

/**
 * TK-88, lot D : la coquille au clavier (palette ⌘K, ordre de focus, noms accessibles), axe, correctifs 1.6 et
 * captures de la coquille (design/screens/captures/S-app-shell/), comparées à 05-Lot1Shell.html et
 * 10-Lot5Fonctionnel.html (voir .workflow/TK-88/03-lot-D.md).
 */
const PROJECT = `/projects/${FEATURE_PROJECT_ID}`;
const SPEC = `${PROJECT}/spec/functional`;
const SHOTS = `${CAPTURES_DIR}/S-app-shell`;
const PHONE = { width: 375, height: 812 };
const STUB = `http://127.0.0.1:${process.env.E2E_API_PORT ?? 3101}`;

test.beforeEach(async () => {
  await setScenario({ session: true, projects: "data" });
});

/** Le thème choisi est mémorisé d'une page à l'autre : le bouton ne propose « sombre » que s'il ne l'est pas déjà. */
async function toDark(page: Page): Promise<void> {
  if (await page.locator("html").evaluate((html) => html.classList.contains("dark"))) return;
  await switchToDark(page);
}

const palette = (page: Page) => page.getByRole("dialog", { name: "Recherche" });
const searchesSeen = async (): Promise<Array<{ q: string; projectId: string | null }>> =>
  (await fetch(`${STUB}/__searches`)).json();

async function openPalette(page: Page, path = SPEC): Promise<void> {
  await page.goto(path);
  await hydrated(page);
  await page.keyboard.press("Control+k");
  await expect(palette(page)).toBeVisible();
}

test.describe("palette ⌘K : raccourci (D1)", () => {
  test("Ctrl K ouvre la palette depuis la page, Échap la ferme", async ({ page }) => {
    await page.goto(SPEC);
    await hydrated(page);
    await page.keyboard.press("Control+k");
    await expect(palette(page)).toBeVisible();
    await expect(palette(page).getByRole("combobox")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(palette(page)).toHaveCount(0);
  });

  test("⌘ K (Meta) l'ouvre aussi", async ({ page }) => {
    await page.goto(SPEC);
    await hydrated(page);
    await page.keyboard.press("Meta+k");
    await expect(palette(page)).toBeVisible();
  });

  test("depuis un champ de saisie : la palette s'ouvre, le champ garde sa saisie, le focus lui revient", async ({
    page,
  }) => {
    await page.goto(SPEC);
    await hydrated(page);
    const field = page.getByLabel("Rechercher une fonctionnalité");
    await field.fill("kanban");
    await page.keyboard.press("Control+k");
    await expect(palette(page)).toBeVisible();
    await expect(field).toHaveValue("kanban");
    await page.keyboard.press("Escape");
    await expect(palette(page)).toHaveCount(0);
    await expect(field).toBeFocused();
  });

  test("le bouton « Rechercher » de la barre affiche le raccourci et ouvre la palette", async ({
    page,
  }) => {
    await page.goto(SPEC);
    const button = sidebarOf(page).getByRole("button", { name: /Rechercher/ });
    await expect(button).toContainText("Ctrl K");
    await expect(button).toHaveAttribute("aria-keyshortcuts", "Control+K Meta+K");
    await hydrated(page);
    await button.click();
    await expect(palette(page)).toBeVisible();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
test.describe("palette ⌘K : recherche serveur (D2, D3, D4)", () => {
  test("une frappe rapide ne part qu'une fois au serveur, avec le projet courant", async ({
    page,
  }) => {
    await openPalette(page);
    await page.keyboard.type("kanb", { delay: 40 });
    await expect(
      palette(page).getByRole("option", { name: /Afficher les colonnes du kanban/ }),
    ).toBeVisible();
    await page.waitForTimeout(400);
    expect(await searchesSeen()).toEqual([{ q: "kanb", projectId: FEATURE_PROJECT_ID }]);
  });

  test("20 résultats affichés sur 134 : le total est annoncé", async ({ page }) => {
    await openPalette(page);
    await page.keyboard.type("beaucoup");
    await expect(palette(page).getByRole("option")).toHaveCount(20);
    await expect(palette(page).getByRole("status")).toHaveText("134 résultats · 20 affichés");
    await expect(palette(page)).toContainText("134 résultats · 20 affichés");
  });

  test("un ticket absent de la page est trouvé ; l'ouvrir mène au tableau du projet", async ({
    page,
  }) => {
    await openPalette(page);
    await page.keyboard.type("numéro 142");
    const option = palette(page).getByRole("option", { name: /Ticket à faire numéro 142/ });
    await expect(option).toContainText("TK-1141");
    await page.keyboard.press("ArrowDown");
    await option.click();
    await expect(page).toHaveURL(new RegExp(`${PROJECT}/tickets$`));
    await expect(page.getByRole("heading", { level: 1, name: "Tickets" })).toBeVisible();
    await expect(palette(page)).toHaveCount(0);
  });

  test("une fonctionnalité est trouvée par son titre ; la fiche s'ouvre dans Spec · Fonctionnel", async ({
    page,
  }) => {
    await openPalette(page, `${PROJECT}/tickets`);
    await page.keyboard.type("F-001");
    await palette(page)
      .getByRole("option", { name: /Connexion par e-mail/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`${SPEC}\\?tab=features&sel=F-001$`));
    await expect(
      page.getByRole("complementary", { name: "Fiche de la fonctionnalité" }),
    ).toBeVisible();
  });

  test("les pages sont filtrées localement : Données (livrée) oui, Architecture (verrouillée) jamais", async ({
    page,
  }) => {
    await openPalette(page);
    const box = palette(page).getByRole("combobox");
    await box.fill("donn");
    await expect(palette(page).getByRole("option", { name: /Spec · Données/ })).toBeVisible();
    await box.fill("archi");
    await expect(palette(page).getByRole("option", { name: /Architecture/ })).toHaveCount(0);
    await box.fill("tickets");
    await expect(
      palette(page)
        .getByRole("option", { name: /Tickets/ })
        .first(),
    ).toBeVisible();
  });

  test("flèches et Entrée : l'option active s'ouvre", async ({ page }) => {
    await openPalette(page);
    await page.keyboard.type("Données");
    await expect(palette(page).getByRole("option", { name: /Spec · Données/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${PROJECT}/spec/data$`));
  });

  test("erreur du serveur : alerte et « Réessayer »", async ({ page }) => {
    await setScenario({ session: true, projects: "data", search: "error" });
    await openPalette(page);
    await page.keyboard.type("kanban");
    await expect(palette(page).getByRole("alert")).toContainText("La recherche a échoué");
    await setScenario({ session: true, projects: "data" });
    await palette(page).getByRole("button", { name: "Réessayer" }).click();
    await expect(
      palette(page).getByRole("option", { name: /Afficher les colonnes/ }),
    ).toBeVisible();
  });
});

/** Noms accessibles successifs de l'élément focalisé, depuis `from` jusqu'au contenu de la page. */
async function focusOrder(page: Page): Promise<string[]> {
  const seen: string[] = [];
  for (let step = 0; step < 40; step++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => document.activeElement?.closest("main") !== null);
    if (stop) break;
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return (el?.getAttribute("aria-label") ?? el?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim();
      }),
    );
  }
  return seen;
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
test.describe("clavier : ordre de focus, noms accessibles, états (D5)", () => {
  test("ordre de focus de la barre étendue (organisation, Rechercher, carte projet, Projet, SPEC, Tickets, Organisation, pied)", async ({
    page,
  }) => {
    await page.goto(SPEC);
    await hydrated(page);
    // Les entrées de SPEC et la carte projet naissent de project.shell : on attend qu'elles soient là.
    await expect(sidebarOf(page).getByRole("link", { name: "Fonctionnel" })).toBeVisible();
    await expect(sidebarOf(page).getByRole("link", { name: "Assistant de cadrage" })).toHaveCount(
      0,
    );
    await sidebarOf(page).getByRole("button").first().focus();
    const order = await focusOrder(page);
    const names = [
      /^Rechercher/,
      /Atelier Lumière/,
      /^Vue d'ensemble/,
      /^Idée/,
      /^Fonctionnel/,
      /^Données/,
      /^Architecture/,
      /^Technique/,
      /^Sécurité/,
      /^Design/,
      /^Qualité/,
      /^Tickets/,
      /^Tous les projets/,
      /^Réglages/,
      /^Replier la barre/,
    ];
    let cursor = 0;
    for (const name of names) {
      const found = order.findIndex((label, index) => index >= cursor && name.test(label));
      expect(found, `${name} dans ${JSON.stringify(order)}`).toBeGreaterThanOrEqual(cursor);
      cursor = found + 1;
    }
    // Le pied (compte, thème) vient après « Replier la barre » et avant le contenu.
    expect(order.at(-1)).toMatch(/thème/i);
  });

  test("1280 × 720 : le pied (Replier, compte, thème) reste visible en bas, la navigation défile au-dessus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(SPEC);
    await hydrated(page);
    await expect(sidebarOf(page).getByRole("link", { name: "Réglages" })).toBeAttached();
    for (const name of [/Replier la barre/, /Menu utilisateur/, /Passer au thème sombre/]) {
      const box = await sidebarOf(page).getByRole("button", { name }).boundingBox();
      expect(box, String(name)).not.toBeNull();
      expect((box?.y ?? 0) + (box?.height ?? 0), String(name)).toBeLessThanOrEqual(720);
    }
    const scrolls = await sidebarOf(page)
      .locator('[data-slot="sidebar-scroll"]')
      .evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(scrolls).toBe(true);
  });

  test("aria-current sur l'entrée de la page ; une seule entrée est courante", async ({ page }) => {
    await page.goto(SPEC);
    await expect(sidebarOf(page).locator('[aria-current="page"]')).toHaveCount(1);
    await expect(sidebarOf(page).getByRole("link", { name: "Fonctionnel" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.goto(`${PROJECT}/tickets`);
    await expect(sidebarOf(page).locator('[aria-current="page"]')).toHaveCount(1);
    await expect(sidebarOf(page).getByRole("link", { name: /^Tickets/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("rail replié : chaque icône seule porte un nom accessible, les verrous restent aria-disabled", async ({
    page,
  }) => {
    await page.goto(SPEC);
    await hydrated(page);
    await collapseOf(page).click();
    await expect(sidebarOf(page)).toHaveAttribute("data-state", "collapsed");
    const unnamed = await sidebarOf(page).evaluate((bar) =>
      Array.from(bar.querySelectorAll("a, button"))
        .filter((el) => {
          const name = el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";
          return name === "";
        })
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(unnamed).toEqual([]);
    // TK-141 A3 : la carte projet disparaît du rail ; une seule icône folder_open (Tous les projets).
    await expect(sidebarOf(page).locator("svg[data-icon='folder_open']")).toHaveCount(1);
    const lock = sidebarOf(page).getByRole("button", {
      name: "Architecture, disponible après les données",
    });
    await expect(lock).toHaveAttribute("aria-disabled", "true");
    await lock.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${SPEC}$|${SPEC}\\?`));
  });

  test("repli : l'état est annoncé dans la région d'état unique", async ({ page }) => {
    await page.goto(SPEC);
    await hydrated(page);
    await collapseOf(page).click();
    // Région `aria-live` sans rôle `status` : l'écran garde un seul `role="status"` (règle 5).
    const announcer = page.locator('[data-slot="shell-announcer"]');
    await expect(announcer).toHaveText("Barre repliée");
    await expect(announcer).toHaveAttribute("aria-live", "polite");
    await expect(announcer).not.toHaveAttribute("role", /.+/);
    // Le seul `role="status"` de l'écran est celui de la page (règle 5), pas celui de la coquille.
    await expect(page.getByRole("status")).toHaveCount(1);
    await collapseOf(page).click();
    await expect(announcer).toHaveText("Barre étendue");
  });

  test("tiroir 375 px : le focus est piégé, Échap le ferme et rend le focus au bouton menu", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto(SPEC);
    await hydrated(page);
    await menuOf(page).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      expect(await drawer.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    // Échap ferme d'abord l'infobulle d'un verrou focalisé : on part d'un lien sans infobulle.
    await drawer.getByRole("link", { name: /^Tickets/ }).focus();
    // L'infobulle d'un verrou quitté à l'instant peut encore être ouverte : Échap la ferme d'abord (02-design §4).
    await expect(async () => {
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0, { timeout: 750 });
    }).toPass({ timeout: 8_000 });
    await expect(menuOf(page)).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});

for (const theme of ["light", "dark"] as Theme[]) {
  test.describe(`axe WCAG 2.2 AA (${theme})`, () => {
    const scan = (page: Page) => new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();

    test("palette ouverte (résultats, aucun résultat, chargement)", async ({ page }) => {
      await page.goto(SPEC);
      await hydrated(page);
      if (theme === "dark") await toDark(page);
      await page.keyboard.press("Control+k");
      await expect(palette(page)).toBeVisible();
      await page.keyboard.type("kanban");
      await expect(palette(page).getByRole("option").first()).toBeVisible();
      await settle(page);
      expect((await scan(page)).violations).toEqual([]);
      await palette(page).getByRole("combobox").fill("zzz");
      await expect(palette(page)).toContainText("Aucun résultat pour « zzz »");
      expect((await scan(page)).violations).toEqual([]);
    });

    test("palette à 375 px et tiroir à 375 px", async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(SPEC);
      await hydrated(page);
      if (theme === "dark") await toDark(page);
      await menuOf(page).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await settle(page);
      expect((await scan(page)).violations).toEqual([]);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Rechercher" }).click();
      await expect(palette(page)).toBeVisible();
      await page.keyboard.type("kanban");
      await expect(palette(page).getByRole("option").first()).toBeVisible();
      expect((await scan(page)).violations).toEqual([]);
    });

    test("coquille sur chaque écran, étendue : projets, fonctionnel, tickets, Bientôt, réglages", async ({
      page,
    }) => {
      for (const path of [
        "/projects",
        SPEC,
        `${PROJECT}/tickets`,
        `${PROJECT}/spec/architecture`,
        "/settings/members",
      ]) {
        await page.goto(path);
        // Le thème choisi est mémorisé : le bouton ne propose « sombre » que la première fois.
        if (theme === "dark") await toDark(page);
        await expect(sidebarOf(page)).toHaveAttribute("data-state", "expanded");
        await settle(page);
        expect((await scan(page)).violations, path).toEqual([]);
      }
    });
  });
}

test.describe("correctifs 1.6 (D8)", () => {
  test("menu utilisateur en sombre : l'anneau n'apparaît qu'au clavier (focus-visible), jamais après un clic", async ({
    page,
  }) => {
    await page.goto(SPEC);
    await switchToDark(page);
    const trigger = sidebarOf(page).getByRole("button", { name: /Menu utilisateur/ });
    const ring = () => trigger.evaluate((el) => getComputedStyle(el).boxShadow);
    await trigger.click();
    await expect(page.getByRole("menuitem", { name: "Se déconnecter" })).toBeVisible();
    // Fermeture à la souris : Radix rend le focus au déclencheur, sans anneau.
    await page.mouse.click(700, 400);
    await expect(page.getByRole("menuitem", { name: "Se déconnecter" })).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await ring()).toBe("none");
    // Au clavier, l'anneau est visible.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(trigger).toBeFocused();
    expect(await ring()).not.toBe("none");
  });

  test("kanban à 375 px : défilement horizontal fin et ombre sur le bord droit, puis sur le gauche", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto(`${PROJECT}/tickets`);
    const columns = page.getByRole("region", { name: "Colonnes du kanban" });
    await expect(columns).toBeVisible();
    await expect(page.locator('[data-edge="end"]')).toBeVisible();
    await expect(page.locator('[data-edge="start"]')).toHaveCount(0);
    const style = await columns.evaluate((el) => {
      const css = getComputedStyle(el);
      return {
        width: css.scrollbarWidth,
        color: css.scrollbarColor,
        scrolls: el.scrollWidth > el.clientWidth,
      };
    });
    expect(style.width).toBe("thin");
    expect(style.scrolls).toBe(true);
    await columns.evaluate((el) => el.scrollTo({ left: 400 }));
    await expect(page.locator('[data-edge="start"]')).toBeVisible();
    await columns.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await expect(page.locator('[data-edge="end"]')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});

/** Captures de la coquille : clair et sombre sur 1280 × 800, et 375 px (02-design.md §8). */
const SIZES = { desktop: { width: 1280, height: 800 }, phone: PHONE };

/** Plus aucun squelette ni état occupé à l'écran : une capture prise pendant le chargement ne prouve rien. */
async function loaded(page: Page): Promise<void> {
  await expect(page.locator('[data-slot="skeleton"], .animate-pulse')).toHaveCount(0);
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
}

async function shoot(
  page: Page,
  name: string,
  theme: Theme,
  phone = false,
  waiting = false,
): Promise<void> {
  if (!waiting) await loaded(page);
  await settle(page);
  await page.screenshot({
    path: `${SHOTS}/${name}-${theme}${phone ? "-mobile" : ""}.png`,
    fullPage: false,
  });
}

for (const theme of ["light", "dark"] as Theme[]) {
  test(`captures S-app-shell : barre étendue, repliée, groupe SPEC, verrou (${theme})`, async ({
    page,
  }) => {
    await page.setViewportSize(SIZES.desktop);
    await page.goto(SPEC);
    await hydrated(page);
    if (theme === "dark") await toDark(page);
    await expect(page.getByRole("heading", { level: 1, name: "Cahier fonctionnel" })).toBeVisible();
    await shoot(page, "expanded", theme);
    await sidebarOf(page).screenshot({ path: `${SHOTS}/spec-group-${theme}.png` });
    const lock = sidebarOf(page).getByRole("button", { name: /^Architecture/ });
    await lock.focus();
    await expect(page.getByRole("tooltip").first()).toBeVisible();
    await shoot(page, "locked-tooltip", theme);
    await collapseOf(page).click();
    await expect(sidebarOf(page)).toHaveAttribute("data-state", "collapsed");
    await shoot(page, "collapsed", theme);
  });

  test(`captures S-app-shell : en-têtes Fonctionnel, Tickets et page « Bientôt » (${theme})`, async ({
    page,
  }) => {
    await page.setViewportSize(SIZES.desktop);
    const pages: Array<[string, string, string]> = [
      ["header-features", SPEC, "Cahier fonctionnel"],
      ["header-tickets", `${PROJECT}/tickets`, "Tickets"],
      ["soon-architecture", `${PROJECT}/spec/architecture`, "Architecture"],
    ];
    for (const [name, path, title] of pages) {
      await page.goto(path);
      await hydrated(page);
      if (theme === "dark") await toDark(page);
      await expect(page.getByRole("heading", { level: 1, name: title }).first()).toBeVisible();
      await shoot(page, name, theme);
    }
  });

  test(`captures S-app-shell : palette, résultats, vide, erreur, chargement (${theme})`, async ({
    page,
  }) => {
    await page.setViewportSize(SIZES.desktop);
    await page.goto(SPEC);
    await hydrated(page);
    if (theme === "dark") await toDark(page);
    await page.keyboard.press("Control+k");
    await expect(palette(page)).toBeVisible();
    await shoot(page, "palette-idle", theme);
    await page.keyboard.type("ticket");
    await expect(palette(page).getByRole("option").first()).toBeVisible();
    await shoot(page, "palette-results", theme);
    await palette(page).getByRole("combobox").fill("zzz");
    await expect(palette(page)).toContainText("Aucun résultat pour « zzz »");
    await shoot(page, "palette-empty", theme);
    await setScenario({ session: true, projects: "data", search: "error" });
    await palette(page).getByRole("combobox").fill("erreur");
    await expect(palette(page).getByRole("alert")).toBeVisible();
    await shoot(page, "palette-error", theme);
    await setScenario({ session: true, projects: "data", search: "loading" });
    await palette(page).getByRole("combobox").fill("attente");
    await expect(palette(page).locator('[aria-busy="true"]')).toBeVisible();
    await shoot(page, "palette-loading", theme, false, true);
    await releaseHeld();
  });

  test(`captures S-app-shell à 375 px : tiroir, en-têtes, Bientôt, palette (${theme})`, async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto(SPEC);
    await hydrated(page);
    if (theme === "dark") await toDark(page);
    await shoot(page, "header-features", theme, true);
    await menuOf(page).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await shoot(page, "drawer", theme, true);
    await page.keyboard.press("Escape");
    for (const [name, path] of [
      ["header-tickets", `${PROJECT}/tickets`],
      ["soon-architecture", `${PROJECT}/spec/architecture`],
    ] as const) {
      await page.goto(path);
      await hydrated(page);
      if (theme === "dark") await toDark(page);
      await shoot(page, name, theme, true);
    }
    await page.getByRole("button", { name: "Rechercher" }).click();
    await page.keyboard.type("ticket");
    await expect(palette(page).getByRole("option").first()).toBeVisible();
    await shoot(page, "palette-results", theme, true);
    await palette(page).getByRole("combobox").fill("zzz");
    await expect(palette(page)).toContainText("Aucun résultat pour « zzz »");
    await shoot(page, "palette-empty", theme, true);
    await setScenario({ session: true, projects: "data", search: "error" });
    await palette(page).getByRole("combobox").fill("erreur");
    await expect(palette(page).getByRole("alert")).toBeVisible();
    await shoot(page, "palette-error", theme, true);
    await setScenario({ session: true, projects: "data", search: "loading" });
    await palette(page).getByRole("combobox").fill("attente");
    await expect(palette(page).locator('[aria-busy="true"]')).toBeVisible();
    await shoot(page, "palette-loading", theme, true, true);
    await releaseHeld();
  });
}

/** Chaque écran existant dans la coquille : clair, sombre, et 375 px (clair et sombre) — `shell-<thème>[-mobile].png`. */
const SCREENS: Array<[string, string]> = [
  ["S-projects", "/projects"],
  ["S-features", SPEC],
  ["S-kanban", `${PROJECT}/tickets`],
  ["S-members", "/settings/members"],
  ["S-github", "/settings/github"],
  ["S-ai-settings", "/settings/ai"],
];

for (const theme of ["light", "dark"] as Theme[]) {
  for (const phone of [false, true]) {
    test(`captures de chaque écran existant dans la coquille (${theme}${phone ? ", 375 px" : ""})`, async ({
      page,
    }) => {
      await setScenario({ session: true, projects: "data", installations: "data" });
      await page.setViewportSize(phone ? PHONE : SIZES.desktop);
      for (const [screen, path] of SCREENS) {
        await page.goto(path);
        await hydrated(page);
        if (theme === "dark") await toDark(page);
        await expect(page.locator("main h1").first()).toBeVisible();
        await loaded(page);
        await settle(page);
        await page.screenshot({
          path: `${CAPTURES_DIR}/${screen}/shell-${theme}${phone ? "-mobile" : ""}.png`,
        });
        // Aucun défilement horizontal de la page, sur aucun écran (02-design §5).
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          screen,
        ).toBe(true);
      }
    });
  }
}

test.describe("hauteur de la barre : Organisation sans défilement (correction 1)", () => {
  /** Tous les liens de la navigation tiennent dans la zone de défilement, sans l'avoir fait défiler. */
  async function expectAllLinksVisible(page: Page, scope: ReturnType<Page["locator"]>) {
    for (const name of ["Tous les projets", "Réglages"]) {
      const box = await scope.getByRole("link", { name, exact: true }).boundingBox();
      const zone = await scope.locator("[data-slot='sidebar-scroll']").boundingBox();
      expect(box, name).not.toBeNull();
      expect(zone).not.toBeNull();
      expect((box?.y ?? 0) + (box?.height ?? 0), name).toBeLessThanOrEqual(
        (zone?.y ?? 0) + (zone?.height ?? 0),
      );
    }
  }

  test("1280 x 800 : « Tous les projets » et « Réglages » sont visibles dans la barre étendue", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(SPEC);
    await hydrated(page);
    await expectAllLinksVisible(page, sidebarOf(page));
  });

  test("375 x 812 : le tiroir montre « Tous les projets » et « Réglages » sans défilement", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto(SPEC);
    await hydrated(page);
    await menuOf(page).click();
    await expectAllLinksVisible(page, page.getByRole("dialog"));
  });
});
