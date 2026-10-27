import { expect, test } from "@playwright/test";
import { CAPTURES_DIR, setScenario, switchToDark } from "./support/helpers.ts";

test("sans session, /projects redirige vers /login", async ({ page }) => {
  await setScenario({ session: false, projects: "data" });
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login$/);
});

test("avec session, /login redirige vers /projects", async ({ page }) => {
  await setScenario({ session: true, projects: "data" });
  await page.goto("/login");
  await expect(page).toHaveURL(/\/projects$/);
});

for (const theme of ["light", "dark"] as const) {
  test(`S-login (${theme}) : bouton GitHub accessible au clavier et capture`, async ({ page }) => {
    await setScenario({ session: false, projects: "data" });
    await page.goto("/login");
    if (theme === "dark") await switchToDark(page);
    await expect(page.getByRole("heading", { level: 1, name: "Connexion à Koklo" })).toBeVisible();
    const button = page.getByRole("button", { name: /Continuer avec GitHub/ });
    await button.focus();
    await expect(button).toBeFocused();
    await page.screenshot({ path: `${CAPTURES_DIR}/S-login/default-${theme}.png`, fullPage: true });
  });
}

test("clic sur « Continuer avec GitHub » : requête de connexion sociale vers l'API (même origine)", async ({
  page,
}) => {
  await setScenario({ session: false, projects: "data" });
  await page.goto("/login");
  const request = page.waitForRequest((r) => r.url().includes("/api/auth/sign-in/social"));
  await page.route("**/api/auth/sign-in/social", (route) =>
    route.fulfill({ json: { url: "/login?mock=github", redirect: false } }),
  );
  await page.getByRole("button", { name: /Continuer avec GitHub/ }).click();
  const sent = await request;
  expect(sent.postDataJSON()).toMatchObject({ provider: "github", callbackURL: "/projects" });
  expect(new URL(sent.url()).origin).toBe("http://127.0.0.1:3100");
});
