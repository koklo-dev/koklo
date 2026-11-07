import { expect, test } from "@playwright/test";
import { uniqueEmail } from "../support/invitation.ts";
import { createAdminSessionCookie, SESSION_COOKIE } from "../support/session.ts";

/** Réglages, Membres (TK-97 lot C) sur la vraie pile : invitation, invitation en attente, annulation. */
test("C1 : un administrateur invite un designer, la voit en attente puis l'annule", async ({
  page,
  baseURL,
}) => {
  const value = await createAdminSessionCookie();
  await page.context().addCookies([{ name: SESSION_COOKIE, value, url: baseURL as string }]);
  const email = uniqueEmail("nouveau");

  await page.goto("/settings/members");
  await expect(page.getByRole("heading", { level: 2, name: "Membres" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Liste des membres" })).toBeVisible();

  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("combobox", { name: "Rôle" }).click();
  await page.getByRole("option", { name: "Designer" }).click();
  await page.getByRole("button", { name: "Inviter" }).click();
  await expect(page.getByText("Invitation créée")).toBeVisible();

  const pending = page.getByRole("button", { name: `Annuler l'invitation à ${email}` });
  await expect(pending).toBeVisible();
  await pending.click();
  await expect(page.getByText(`Invitation à ${email} annulée.`)).toBeVisible();
  await expect(pending).toHaveCount(0);
});

test("C2 : la matrice des rôles montre neuf actions pour six rôles", async ({ page, baseURL }) => {
  const value = await createAdminSessionCookie();
  await page.context().addCookies([{ name: SESSION_COOKIE, value, url: baseURL as string }]);
  await page.goto("/settings/members");
  await page.getByText("Ce que chaque rôle peut faire").click();
  const region = page.getByRole("region", { name: "Ce que chaque rôle peut faire" });
  await expect(region.getByRole("cell", { name: /: (oui|non)$/ })).toHaveCount(54);
});
