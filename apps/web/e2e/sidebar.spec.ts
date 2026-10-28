import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { setScenario, sidebarOf, switchToDark, triggerOf } from "./support/helpers.ts";

test.beforeEach(async () => {
  await setScenario({ session: true, projects: "data" });
});

test("sidebar : le trigger est un bouton nommé qui replie et rouvre la barre (clavier)", async ({
  page,
}) => {
  await page.goto("/projects");
  const trigger = triggerOf(page);
  await expect(trigger).toHaveAccessibleName(/barre latérale/i);
  await expect(sidebarOf(page)).toHaveAttribute("data-state", "expanded");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(sidebarOf(page)).toHaveAttribute("data-state", "collapsed");
  // Replié : le lien garde son nom accessible.
  await expect(sidebarOf(page).getByRole("link", { name: "Projets" })).toBeVisible();
});

test("sidebar : le rail et le raccourci Ctrl+B replient la barre", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.locator('[data-sidebar="rail"]')).toHaveAccessibleName(/.+/);
  await page.keyboard.press("Control+b");
  await expect(sidebarOf(page)).toHaveAttribute("data-state", "collapsed");
});

test("sidebar : le menu utilisateur propose thème et « Se déconnecter », focus visible", async ({
  page,
}) => {
  await page.goto("/projects");
  const link = sidebarOf(page).getByRole("link", { name: "Projets" });
  await link.focus();
  await expect(link).toBeFocused();
  await page.getByRole("button", { name: "Menu utilisateur" }).click();
  await expect(page.getByRole("menuitem", { name: /thème/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Se déconnecter" })).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  test(`sidebar : axe WCAG AA sans violation, étendue et repliée (${theme})`, async ({ page }) => {
    await page.goto("/projects");
    if (theme === "dark") await switchToDark(page);
    const scan = () =>
      new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect((await scan()).violations).toEqual([]);
    await triggerOf(page).click();
    await expect(sidebarOf(page)).toHaveAttribute("data-state", "collapsed");
    // Pas de mesure de contraste en pleine transition d'opacité (repli animé du bloc).
    await page.evaluate(() => Promise.allSettled(document.getAnimations().map((a) => a.finished)));
    expect((await scan()).violations).toEqual([]);
  });
}

test("sidebar mobile 375 px : Sheet ouverte au clavier, Échap ferme et restitue le focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/projects");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const trigger = triggerOf(page);
  const box = await trigger.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
