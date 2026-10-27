import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { setScenario, switchToDark } from "./support/helpers.ts";

test.beforeEach(async () => {
  await setScenario({ session: true, projects: "data" });
});

test("sidebar : le trigger est un bouton nommé qui replie et rouvre la barre (clavier)", async ({
  page,
}) => {
  await page.goto("/projects");
  const trigger = page.getByRole("button", { name: "Réduire la barre latérale" });
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const reopen = page.getByRole("button", { name: "Ouvrir la barre latérale" });
  await expect(reopen).toHaveAttribute("aria-expanded", "false");
  // Replié : le lien garde son nom accessible.
  await expect(
    page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link", { name: "Projets" }),
  ).toBeVisible();
});

test("sidebar : Tab atteint le lien Projets puis la bascule de thème, focus visible", async ({
  page,
}) => {
  await page.goto("/projects");
  const link = page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "Projets" });
  await link.focus();
  await expect(link).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /Passer au thème/ })).toBeFocused();
});

for (const theme of ["light", "dark"] as const) {
  test(`sidebar : axe WCAG AA sans violation, étendue et repliée (${theme})`, async ({ page }) => {
    await page.goto("/projects");
    if (theme === "dark") await switchToDark(page);
    const scan = () =>
      new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect((await scan()).violations).toEqual([]);
    await page.getByRole("button", { name: "Réduire la barre latérale" }).click();
    expect((await scan()).violations).toEqual([]);
  });
}

test("sidebar mobile 375 px : Sheet ouverte au clavier, Échap ferme et restitue le focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/projects");
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "Ouvrir la barre latérale" });
  const box = await trigger.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  const toggle = page.getByRole("button", { name: /Passer au thème/ });
  // La Sheet entre en 150 ms (échelle 0,97 → 1) : on mesure une fois la taille stabilisée.
  await expect
    .poll(async () => (await toggle.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
