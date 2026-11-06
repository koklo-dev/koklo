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
