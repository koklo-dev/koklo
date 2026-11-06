import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { AXE_TAGS, CAPTURES_DIR, settle, type Theme } from "./support/helpers.ts";

/**
 * TK-87 CA2 (cas 2.11), CA4 (cas 4.5) et CA6 (cas 6.1, 6.2) : galerie `/dev/ui` (fiche S-dev-ui).
 * Le serveur e2e tourne en APP_ENV=test : la galerie est ouverte. Le 404 de production est prouvé par
 * `test/dev-ui-page.test.tsx` (sans serveur de production).
 */
const PATH = "/dev/ui";
const DIR = `${CAPTURES_DIR}/S-dev-ui`;
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900, suffix: "" },
  { name: "mobile", width: 375, height: 812, suffix: "-mobile" },
] as const;
async function open(page: Page, theme: Theme): Promise<void> {
  const response = await page.goto(PATH);
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "Galerie des composants" }),
  ).toBeVisible();
  if (theme === "dark") {
    // La galerie a sa propre bascule (hors AppShell) ; avant l'hydratation le clic est sans effet.
    await expect(async () => {
      await page
        .getByRole("group", { name: "Thème" })
        .getByRole("button", { name: "Sombre" })
        .click();
      await expect(page.locator("html")).toHaveClass(/\bdark\b/, { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  }
}

async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const theme of ["light", "dark"] as Theme[]) {
  for (const viewport of VIEWPORTS) {
    test(`S-dev-ui ${viewport.name} (${theme}) : 200, axe sans violation, capture pleine page`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await open(page, theme);
      await settle(page);
      await expectNoViolations(page);
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `${DIR}/full-${theme}${viewport.suffix}.png`, fullPage: true });
    });
  }

  test(`S-dev-ui aperçu ouvert au focus (${theme}) : HoverCard sur F-001, axe, capture`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, theme);
    await page.getByRole("link", { name: "Fonctionnalité F-001 Connexion" }).focus();
    const summary = page.getByText("3 critères · liée à S-login");
    await expect(summary.first()).toBeVisible();
    await settle(page);
    await expectNoViolations(page);
    await page.screenshot({ path: `${DIR}/hovercard-${theme}.png`, fullPage: false });
    await page.keyboard.press("Escape");
  });

  test(`S-dev-ui « Détails » déplié (${theme}) : bloc d'envoi, axe, capture`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, theme);
    const toggle = page.getByRole("button", { name: "Détails" }).first();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Ne saisissez pas de données personnelles.").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Anthropic|États-Unis/);
    await settle(page);
    await expectNoViolations(page);
    await toggle.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${DIR}/details-open-${theme}.png`, fullPage: false });
  });
}

/** TK-94 lot B : section « Listes longues » (fiche S-dev-ui §3, captures lists-*). */
const lists = (page: Page) => page.getByRole("region", { name: "Listes longues" });

for (const theme of ["light", "dark"] as Theme[]) {
  for (const viewport of VIEWPORTS) {
    test(`S-dev-ui listes longues ${viewport.name} (${theme}) : axe sans violation, sans défilement horizontal, capture`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await open(page, theme);
      await lists(page).scrollIntoViewIfNeeded();
      await settle(page);
      const results = await new AxeBuilder({ page })
        .include("[aria-labelledby='dev-ui-lists']")
        .withTags(AXE_TAGS)
        .analyze();
      expect(results.violations).toEqual([]);
      await expectNoHorizontalScroll(page);
      await lists(page).screenshot({ path: `${DIR}/lists-${theme}${viewport.suffix}.png` });
    });
  }
}

test("S-dev-ui GroupSection à 375 px : titre, compteurs et action ne se chevauchent pas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page, "light");
  const header = lists(page).locator("[data-slot='group-section-header']").first();
  await header.scrollIntoViewIfNeeded();
  const boxes = await Promise.all(
    [
      header.locator("button[aria-expanded] > span").nth(0),
      header.locator("button[aria-expanded] > span").nth(1),
      header.getByRole("button", { name: "Accepter les 22 restantes" }),
    ].map((item) => item.boundingBox()),
  );
  const [title, counts, action] = boxes;
  for (const box of [title, counts, action]) {
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
  }
  const apart = (a: NonNullable<typeof title>, b: NonNullable<typeof title>) =>
    a.y + a.height <= b.y + 1 ||
    b.y + b.height <= a.y + 1 ||
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x;
  expect(apart(title!, counts!)).toBe(true);
  expect(apart(counts!, action!)).toBe(true);
  await expect(header.getByRole("button", { name: "Accepter les 22 restantes" })).toBeVisible();
});

test("S-dev-ui VirtualList : peu de lignes dans le DOM, la suite arrive en approchant du bas, l'annonce ne vole pas le focus", async ({
  page,
}) => {
  await open(page, "light");
  const list = lists(page).getByRole("list", { name: "Fonctionnalités (exemple)" });
  await list.scrollIntoViewIfNeeded();
  const rows = list.getByRole("listitem");
  expect(await rows.count()).toBeLessThanOrEqual(80);
  await expect(rows.first()).toHaveAttribute("aria-setsize", "1000");
  const status = lists(page).getByRole("status").first();
  const scroller = lists(page).locator("[data-slot='virtual-list']");
  await rows.nth(3).focus();
  // 50 lignes de 52 px = 2 600 px : à 80 % de la liste chargée (2 080 px), la sentinelle déclenche la page suivante.
  await scroller.evaluate((el) => {
    el.scrollTop = 1_900;
  });
  await expect(status).toHaveText("50 fonctionnalités de plus chargées · 100 sur 1 000", {
    timeout: 5_000,
  });
  expect(await rows.count()).toBeLessThanOrEqual(80);
  await expect(page.locator("[data-row-key]:focus")).toHaveCount(1);
});

test("S-dev-ui : les 8 composants, HoverCard, les boutons et le désactivé avec sa raison", async ({
  page,
}) => {
  await open(page, "light");
  for (const slot of [
    "lifecycle-status",
    "validation-status",
    "deliverable-status",
    "priority-indicator",
    "entity-chip",
    "inline-alert",
    "empty-state",
    "phase-rail",
  ]) {
    expect(await page.locator(`[data-slot='${slot}']`).count(), slot).toBeGreaterThan(0);
  }
  const disabled = page.getByRole("button", { name: "Désactivé" });
  await expect(disabled).toBeDisabled();
  await expect(disabled).toHaveAccessibleDescription("Toujours avec sa raison à côté");
  await expect(page.getByRole("button", { name: "Action principale" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Secondaire" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Discret" })).toBeEnabled();
});

test("S-dev-ui : le bouton désactivé n'a plus d'opacité réduite et porte le pointillé", async ({
  page,
}) => {
  await open(page, "light");
  const style = await page.getByRole("button", { name: "Désactivé" }).evaluate((el) => {
    const s = getComputedStyle(el);
    return { opacity: s.opacity, borderStyle: s.borderTopStyle };
  });
  expect(style.opacity).toBe("1");
  expect(style.borderStyle).toBe("dashed");
});
