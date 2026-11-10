import { expect, test } from "@playwright/test";
import { createAdminSessionCookie, SEED, SESSION_COOKIE } from "../support/session.ts";

test("session de test → liste des projets du seed", async ({ page, baseURL }) => {
  const value = await createAdminSessionCookie();
  await page.context().addCookies([{ name: SESSION_COOKIE, value, url: baseURL as string }]);

  await page.goto("/projects");

  await expect(page).toHaveURL(/\/projects$/);
  const cards = page.getByTestId("projects-grid").getByRole("link");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText(SEED.projectName);
  await expect(cards.first()).toHaveAccessibleName(new RegExp(`^${SEED.projectName}`));
  await expect(page.getByRole("group", { name: "Filtrer par phase" })).toBeVisible();
  await expect(page.getByText(/^1 projet/)).toBeVisible();
});

test("sans session, /projects redirige vers /login (vrai API)", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login$/);
});
