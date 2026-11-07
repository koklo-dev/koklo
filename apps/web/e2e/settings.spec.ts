import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { AXE_TAGS, type KanbanRole, setScenario } from "./support/helpers.ts";

/**
 * Réglages, lot B (design/screens/S-settings.md) : cadre, navigation par rôle, Général, Mon compte, thème.
 * Pile locale : faux API (stub-settings). Axe sans violation sur chaque section x rôle, clair et sombre, 375 px.
 */
const SECTIONS_OF: Record<KanbanRole, string[]> = {
  owner: ["general", "members", "ai", "github", "account"],
  admin: ["general", "members", "ai", "github", "account"],
  dev: ["members", "account"],
  designer: ["members", "account"],
  business: ["members", "account"],
  client: ["account"],
};

const open = async (
  page: Page,
  role: KanbanRole,
  path: string,
  theme: "light" | "dark" = "light",
) => {
  await setScenario({
    session: true,
    projects: "data",
    role,
    providers: { list: "empty" },
    installations: "data",
  });
  await page.addInitScript((value) => localStorage.setItem("koklo-theme", value), theme);
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: "Réglages" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
};

for (const theme of ["light", "dark"] as const) {
  for (const [role, sections] of Object.entries(SECTIONS_OF) as Array<[KanbanRole, string[]]>) {
    for (const section of sections) {
      test(`axe, 375 px sans défilement horizontal : ${section} en ${role} (${theme})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        await open(page, role, `/settings/${section}`, theme);
        if (section === "general")
          await expect(page.getByLabel("Nom de l'organisation")).toBeVisible();
        if (section === "account")
          await expect(page.getByLabel("Nom", { exact: true })).toBeVisible();
        await page.waitForLoadState("networkidle");
        const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(results.violations).toEqual([]);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
}

test("navigation secondaire de 240 px à gauche sur grand écran", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, "owner", "/settings/general");
  const nav = page.getByRole("navigation", { name: "Sections des réglages" });
  const box = await nav.boundingBox();
  expect(box?.width).toBe(240);
  await expect(nav.getByRole("link", { name: "Général" })).toHaveAttribute("aria-current", "page");
});

test("Réglages est visible du client et mène à Mon compte", async ({ page }) => {
  await setScenario({ session: true, projects: "data", role: "client" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/projects");
  await page.getByRole("link", { name: "Réglages" }).click();
  await expect(page).toHaveURL(/\/settings\/account$/);
});

for (const [role, from, to] of [
  ["client", "/settings/members", "/settings/account"],
  ["client", "/settings", "/settings/account"],
  ["dev", "/settings/github", "/settings/members"],
  ["dev", "/settings/general", "/settings/members"],
  ["owner", "/settings", "/settings/members"],
] as const) {
  test(`${role} sur ${from} arrive sur ${to}`, async ({ page }) => {
    await open(page, role, from);
    await expect(page).toHaveURL(new RegExp(`${to}$`));
  });
}

test("développeur : bandeau de lecture seule sur Membres, sans action", async ({ page }) => {
  await open(page, "dev", "/settings/members");
  await expect(
    page.getByText(
      "Lecture seule : seuls les propriétaires et les administrateurs modifient cette section.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Inviter/ })).toHaveCount(0);
});

test("Général : adresse déjà utilisée", async ({ page }) => {
  await open(page, "owner", "/settings/general");
  const slug = page.getByLabel("Adresse", { exact: true });
  await slug.fill("pris");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Cette adresse est déjà utilisée.")).toBeVisible();
});

test("Mon compte : thème Système suit le système et survit au rechargement sans flash", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await open(page, "owner", "/settings/account");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.locator("label", { hasText: "Système" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.addInitScript(() => localStorage.setItem("koklo-theme", "system"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.locator("label", { hasText: "Clair" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("Mon compte : un interrupteur d'e-mail s'enregistre et reste après rechargement", async ({
  page,
}) => {
  await open(page, "owner", "/settings/account");
  const digest = page.getByRole("switch", { name: "Résumé de la semaine" });
  await expect(digest).toHaveAttribute("aria-checked", "false");
  await digest.click();
  await expect(digest).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.getByRole("switch", { name: "Résumé de la semaine" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});
