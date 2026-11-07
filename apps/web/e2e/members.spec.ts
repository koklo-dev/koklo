import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  AXE_TAGS,
  CAPTURES_DIR,
  type KanbanRole,
  setScenario,
  settle,
  type Theme,
} from "./support/helpers.ts";

/**
 * Réglages, lot C : Membres (design/screens/S-settings.md). Pile locale : faux API (stub-members).
 * Invitation avec projets, tableau paginé, menu de rôle et retrait, invitations en attente, matrice.
 */
const open = async (
  page: Page,
  role: KanbanRole = "owner",
  members?: "many",
  theme: Theme = "light",
) => {
  await setScenario({
    session: true,
    projects: "data",
    role,
    providers: { list: "empty" },
    installations: "data",
    ...(members ? { members } : {}),
  });
  await page.addInitScript((value) => localStorage.setItem("koklo-theme", value), theme);
  await page.goto("/settings/members");
  await expect(page.getByRole("heading", { level: 2, name: "Membres" })).toBeVisible();
  await expect(page.getByText("Moussa Diallo")).toBeVisible();
};

const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("inviter un client avec un projet : confirmation puis invitation en attente", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Adresse e-mail").fill("nadia@example.com");
  await page.getByRole("combobox", { name: "Rôle" }).click();
  await page.getByRole("option", { name: "Client" }).click();
  await page.getByRole("button", { name: "Inviter" }).click();
  await expect(page.getByText("Choisissez au moins un projet.")).toBeVisible();
  await page.getByRole("checkbox", { name: "Plateforme de réservation" }).check();
  await page.getByRole("button", { name: "Inviter" }).click();
  await expect(page.getByText("Invitation créée")).toBeVisible();
  await expect(page.getByText("Invitations en attente · 1")).toBeVisible();
  await expect(page.getByText("nadia@example.com").first()).toBeVisible();
});

test("invitations en attente : Renvoyer puis Annuler", async ({ page }) => {
  await open(page);
  await page.getByLabel("Adresse e-mail").fill("nina@example.com");
  await page.getByRole("combobox", { name: "Rôle" }).click();
  await page.getByRole("option", { name: "Designer" }).click();
  await page.getByRole("button", { name: "Inviter" }).click();
  await expect(page.getByText("Invitations en attente · 1")).toBeVisible();
  await page.getByRole("button", { name: "Renvoyer l'invitation à nina@example.com" }).click();
  await expect(page.getByText("Invitation renvoyée à nina@example.com.")).toBeVisible();
  await page.getByRole("button", { name: "Annuler l'invitation à nina@example.com" }).click();
  await expect(page.getByText("Aucune invitation en attente.")).toBeVisible();
});

test("menu de rôle : jamais sur soi, changement annoncé", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("button", { name: "Actions pour Awa Koné" })).toHaveCount(0);
  await page.getByRole("button", { name: "Actions pour Moussa Diallo" }).click();
  await page.getByRole("menuitem", { name: "Designer" }).click();
  await expect(page.getByText("Rôle de Moussa Diallo : Designer")).toBeVisible();
  await expect(page.getByRole("row", { name: /Moussa Diallo/ })).toContainText("Designer");
});

test("retrait : confirmation, « Garder » d'abord, puis « Retirer »", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Actions pour Moussa Diallo" }).click();
  await page.getByRole("menuitem", { name: "Retirer de l'organisation" }).click();
  const group = page.getByRole("group", { name: "Confirmer le retrait" });
  await expect(group.getByRole("button", { name: "Garder" })).toBeFocused();
  await group.getByRole("button", { name: "Retirer" }).click();
  await expect(page.getByText("Moussa Diallo a été retiré.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Moussa Diallo/ })).toHaveCount(0);
});

test("pagination numérotée : 59 membres, page 2", async ({ page }) => {
  await open(page, "owner", "many");
  await expect(page.getByText("59 membres")).toBeVisible();
  await expect(page.getByText("1–25 sur 59")).toBeVisible();
  await page.getByRole("button", { name: "Page 2" }).click();
  await expect(page.getByText("26–50 sur 59")).toBeVisible();
  await expect(page.getByText("Membre 24")).toBeVisible();
});

test("développeur : lecture seule, matrice visible, aucune action", async ({ page }) => {
  await open(page, "dev");
  await expect(page.getByRole("button", { name: /Actions pour|Inviter/ })).toHaveCount(0);
  await expect(page.getByText(/Invitations en attente/)).toHaveCount(0);
  await page.getByText("Ce que chaque rôle peut faire").click();
  await expect(page.getByRole("cell", { name: "Développeur : oui" }).first()).toBeVisible();
});

for (const theme of ["light", "dark"] as Theme[]) {
  test(`axe et 375 px : Membres avec matrice ouverte et confirmation (${theme})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await open(page, "owner", undefined, theme);
    await page.getByText("Ce que chaque rôle peut faire").click();
    await page.getByRole("button", { name: "Actions pour Moussa Diallo" }).click();
    await page.getByRole("menuitem", { name: "Retirer de l'organisation" }).click();
    await expect(page.getByRole("group", { name: "Confirmer le retrait" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);
  });

  test(`axe : invitation d'un client et invitation en attente (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await open(page, "owner", undefined, theme);
    await page.getByLabel("Adresse e-mail").fill("nadia@example.com");
    await page.getByRole("combobox", { name: "Rôle" }).click();
    await page.getByRole("option", { name: "Client" }).click();
    await page.getByRole("checkbox", { name: "Atelier Lumière" }).check();
    await page.getByRole("button", { name: "Inviter" }).click();
    await expect(page.getByText("Invitations en attente · 1")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);
  });
}

const SHOTS: Array<{ state: string; role: KanbanRole; theme: Theme; width: number }> = [
  { state: "members-owner-light", role: "owner", theme: "light", width: 1280 },
  { state: "members-owner-dark", role: "owner", theme: "dark", width: 1280 },
  { state: "members-owner-mobile", role: "owner", theme: "light", width: 375 },
  { state: "members-dev-light", role: "dev", theme: "light", width: 1280 },
];
for (const { state, role, theme, width } of SHOTS) {
  test(`capture S-settings ${state}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, role, undefined, theme);
    await settle(page);
    await page.screenshot({ path: `${CAPTURES_DIR}/S-settings/${state}.png`, fullPage: true });
  });
}
