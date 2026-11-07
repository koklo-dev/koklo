import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  AXE_TAGS,
  CAPTURES_DIR,
  providerCallsSeen,
  providerSecretLeaks,
  releaseHeld,
  setScenario,
  settle,
  switchToDark,
  type Theme,
} from "./support/helpers.ts";
import { E2E_SECRET, type ProvidersScenario } from "./support/stub-ai-providers.ts";

/**
 * Fournisseurs d'IA (design/screens/S-ai-settings.md v2). Pile locale : faux API (support/stub-ai-providers.ts) et
 * navigateur réel ; jamais un fournisseur réel ni Postgres. La clé de test est une sentinelle clairement factice.
 * Captures : design/screens/captures/S-ai-settings/<état>-<thème>.png (+ -mobile à 375 px).
 */
const PATH = "/settings/ai";
type Providers = ProvidersScenario["providers"];

async function open(page: Page, providers: Providers = {}, role?: "dev" | "owner" | "admin") {
  await setScenario({ session: true, projects: "data", providers, ...(role ? { role } : {}) });
  await page.goto(PATH);
}
const ready = (page: Page) =>
  expect(page.getByRole("heading", { level: 3, name: "Fournisseurs" })).toBeVisible();
const shot = (page: Page, state: string, theme: Theme | "mobile") =>
  page.screenshot({ path: `${CAPTURES_DIR}/S-ai-settings/${state}-${theme}.png`, fullPage: true });
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function addGoogle(page: Page) {
  await page.getByRole("button", { name: "Ajouter un fournisseur" }).click();
  await page.getByRole("radio", { name: /Google/ }).check({ force: true });
  await page.getByLabel(/^Clé [A-ZÀ-Ý]/).fill(E2E_SECRET);
  await page.getByRole("button", { name: "Vérifier et enregistrer" }).click();
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const STATES: Array<{ state: string; providers: Providers; expected: string }> = [
  {
    state: "empty",
    providers: { list: "empty" },
    expected: "Aucun fournisseur configuré. L'IA est indisponible.",
  },
  { state: "two", providers: { list: "two" }, expected: "Consommation de novembre 2026" },
  { state: "invalid", providers: { list: "invalid" }, expected: "Refusée" },
  {
    state: "error",
    providers: { list: "internal" },
    expected: "Impossible de charger les fournisseurs d'IA",
  },
];

for (const theme of ["light", "dark"] as Theme[]) {
  for (const { state, providers, expected } of STATES) {
    test(`S-ai-settings ${state} (${theme}) : état visible et axe`, async ({ page }) => {
      await open(page, providers);
      if (theme === "dark") await switchToDark(page);
      await expect(page.getByText(expected).first()).toBeVisible();
      await axe(page);
    });
  }
}

test("375 px : sans défilement horizontal, axe, ajout et modèles ouverts", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page, { list: "two" });
  await ready(page);
  await page.getByRole("button", { name: "Ajouter un fournisseur" }).click();
  await page
    .getByRole("button", { name: /^Changer/ })
    .first()
    .click();
  await axe(page);
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test("ajout : la clé voyage dans le corps seul, la ligne apparaît, le champ est vidé", async ({
  page,
}) => {
  await open(page, { list: "one" });
  await ready(page);
  await addGoogle(page);
  await expect(page.getByRole("listitem", { name: /^Fournisseur Google Gemini/ })).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Fournisseur ajouté et vérifié." }),
  ).toBeVisible();
  const posts = (await providerCallsSeen()).filter((c) => c.method === "POST");
  expect(posts).toHaveLength(1);
  expect(JSON.stringify(posts[0]?.body)).toContain(E2E_SECRET);
  expect(await providerSecretLeaks()).toBe(0);
  expect(await page.content()).not.toContain(E2E_SECRET);
});

test("ajout refusé : alerte sans nom de fournisseur, focus sur l'alerte, rien ajouté", async ({
  page,
}) => {
  await open(page, { list: "one", add: "auth" });
  await ready(page);
  await addGoogle(page);
  const alert = page.getByRole("alert").filter({ hasText: "n'a pas été enregistrée" });
  await expect(alert).toBeFocused();
  expect(await alert.textContent()).not.toMatch(/Anthropic|OpenAI|Google|Mistral|OpenRouter/);
  await expect(page.getByLabel(/^Clé [A-ZÀ-Ý]/)).toHaveValue("");
  await expect(page.getByRole("listitem", { name: /Google/ })).toHaveCount(0);
  expect(await page.content()).not.toContain(E2E_SECRET);
});

test("cartes radio : les flèches déplacent le choix", async ({ page }) => {
  await open(page, { list: "empty" });
  const first = page.getByRole("radio").first();
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
});

test("modèle par usage : liste ouverte, choix au clavier, Échap rend le focus", async ({
  page,
}) => {
  await open(page, { list: "two" });
  await ready(page);
  const change = page.getByRole("button", { name: /^Changer le modèle : Cadrage de l'idée/ });
  await change.click();
  await expect(change).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("option", { name: /économique/ }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(change).toBeFocused();
  await change.click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listitem", { name: "Cadrage de l'idée" })).toContainText(
    "claude-e2e-sonnet",
  );
});

test("retrait : confirmation en ligne, Garder au focus, puis retrait", async ({ page }) => {
  await open(page, { list: "two" });
  await ready(page);
  const row = page.getByRole("listitem", { name: /^Fournisseur OpenAI/ });
  await row.getByRole("button", { name: /^Retirer/ }).click();
  await expect(page.getByRole("button", { name: "Garder" })).toBeFocused();
  await page
    .getByRole("group", { name: /Confirmer le retrait/ })
    .getByRole("button", { name: "Retirer" })
    .click();
  await expect(row).toHaveCount(0);
});

test("secours : l'interrupteur bascule et le texte suit", async ({ page }) => {
  await open(page, { list: "two" });
  await ready(page);
  const toggle = page.getByRole("switch");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText(/la demande repart chez OpenAI/)).toBeVisible();
});

test("plafond : saisi en euros, refusé à 0", async ({ page }) => {
  await open(page, { list: "two" });
  await ready(page);
  const field = page.getByLabel("Plafond mensuel (en euros)");
  await field.fill("0");
  await page.getByRole("button", { name: "Enregistrer le plafond" }).click();
  await expect(page.getByText(/supérieur à 0/)).toBeVisible();
  await field.fill("25,5");
  await page.getByRole("button", { name: "Enregistrer le plafond" }).click();
  await expect(page.getByText("Plafond enregistré.")).toBeVisible();
  const patch = (await providerCallsSeen()).filter((c) => c.method === "PATCH");
  expect(patch.at(-1)?.body).toEqual({ monthlyCapMicroUsd: 25500000 });
});

test("développeur : refus, aucun appel d'API des fournisseurs", async ({ page }) => {
  await open(page, { list: "two" }, "dev");
  await expect(page).toHaveURL(/\/settings\/members$/);
  expect(await providerCallsSeen()).toEqual([]);
});

test("chargement annoncé puis liste", async ({ page }) => {
  await open(page, { list: "loading" });
  await expect(page.getByText("Chargement des fournisseurs d'IA…")).toBeVisible();
  // La requête doit être arrivée (donc retenue) au faux API avant de la libérer.
  await expect.poll(async () => (await providerCallsSeen()).length).toBeGreaterThan(0);
  await releaseHeld();
  await ready(page);
});

/** Captures jointes à la PR (§7 de la fiche) : liste, ajout (OpenRouter), modèles ouverts, vide, test échoué. */
const SIZES = [
  { suffix: "light", theme: "light", width: 1280 },
  { suffix: "dark", theme: "dark", width: 1280 },
  { suffix: "mobile", theme: "light", width: 375 },
] as const;

for (const { suffix, theme, width } of SIZES) {
  test(`captures S-ai-settings (${suffix})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, { list: "two" });
    if (theme === "dark") await switchToDark(page);
    await ready(page);
    await settle(page);
    await shot(page, "providers", suffix);
    await page.getByRole("button", { name: "Ajouter un fournisseur" }).click();
    await page.getByRole("radio", { name: /OpenRouter/ }).check({ force: true });
    await settle(page);
    await shot(page, "add", suffix);
    await page.getByRole("button", { name: "Ajouter un fournisseur" }).click();
    await page.getByRole("button", { name: /^Changer le modèle : Cadrage de l'idée/ }).click();
    await settle(page);
    await shot(page, "models-open", suffix);
  });
}

test("captures S-ai-settings (vide, test échoué)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, { list: "empty" });
  await expect(page.getByText("Aucun fournisseur configuré. L'IA est indisponible.")).toBeVisible();
  await settle(page);
  await shot(page, "empty", "light");
  await open(page, { list: "one", add: "auth" });
  await ready(page);
  await addGoogle(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "n'a pas été enregistrée" }),
  ).toBeVisible();
  await settle(page);
  await shot(page, "test-failed", "light");
});
