import { expect, test } from "@playwright/test";
import { createAdminSessionCookie, SEED, SESSION_COOKIE } from "../support/session.ts";

test("session de test → liste des projets du seed", async ({ page, baseURL }) => {
  const value = await createAdminSessionCookie();
  await page.context().addCookies([{ name: SESSION_COOKIE, value, url: baseURL as string }]);

  await page.goto("/projects");

  await expect(page).toHaveURL(/\/projects$/);
  const rows = page.getByRole("row").filter({ hasNot: page.getByRole("columnheader") });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(SEED.projectName);
});

test("sans session, /projects redirige vers /login (vrai API)", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login$/);
});
