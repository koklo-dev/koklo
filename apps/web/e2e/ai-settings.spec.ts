import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Request, test } from "@playwright/test";
import {
  AXE_TAGS,
  CAPTURES_DIR,
  llmCallsSeen,
  llmSecretLeaks,
  releaseHeld,
  setScenario,
  settle,
  sidebarOf,
  switchToDark,
  type Theme,
} from "./support/helpers.ts";
import { FEATURE_PROJECT_ID } from "./support/stub-features.ts";
import { E2E_MODEL, E2E_SECRET, type LlmScenario } from "./support/stub-llm-credential.ts";

/**
 * Réglages de l'IA (design/screens/S-ai-settings.md). Pile locale : faux API avec faux fournisseur
 * (support/stub-llm-credential.ts) et navigateur réel ; jamais Anthropic ni Postgres. La clé de test est une
 * sentinelle clairement factice. Captures : design/screens/captures/S-ai-settings/<état>-<thème>.png
 * (+ -mobile à 375 px) ; le Red n'en écrit aucune, le Green/Refactor les génère.
 */
const PATH = "/settings/ai";
const SAVE = "Enregistrer et vérifier";
const FIELD = "Clé API Anthropic";
const UNCONFIGURED = "L'IA n'est pas encore configurée pour votre organisation.";

async function open(page: Page, llm: LlmScenario["llm"] = {}, role?: "dev" | "owner" | "admin") {
  await setScenario({ session: true, projects: "data", llm, ...(role ? { role } : {}) });
  await page.goto(PATH);
}
const keyField = (page: Page) => page.getByLabel(FIELD);
const shot = (page: Page, state: string, theme: Theme | "mobile") =>
  page.screenshot({ path: `${CAPTURES_DIR}/S-ai-settings/${state}-${theme}.png`, fullPage: true });

async function fillAndSend(page: Page, value = E2E_SECRET) {
  await keyField(page).fill(value);
  await page.getByRole("button", { name: SAVE }).click();
}

const STATES: Array<{ state: string; llm: LlmScenario["llm"]; expected: string }> = [
  { state: "loading", llm: { list: "loading" }, expected: "Chargement des réglages de l'IA…" },
  { state: "absent", llm: { list: "absent" }, expected: "Non configurée" },
  { state: "configured", llm: { list: "configured" }, expected: "Configurée" },
  {
    state: "invalid",
    llm: { list: "invalid" },
    expected: "Refusée par le fournisseur (désactivée)",
  },
  {
    state: "error",
    llm: { list: "internal" },
    expected: "Impossible de charger les réglages de l'IA",
  },
];

for (const theme of ["light", "dark"] as Theme[]) {
  for (const { state, llm, expected } of STATES) {
    test(`S-ai-settings ${state} (${theme}) : état visible, axe et capture`, async ({ page }) => {
      await open(page, llm);
      if (theme === "dark") await switchToDark(page);
      await expect(page.getByTestId("ai-settings-page")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: "IA" })).toBeVisible();
      await expect(page.getByText(expected).first()).toBeVisible();
      await settle(page);
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
      await shot(page, state, theme);
      await releaseHeld();
    });
  }
}

test("S-ai-settings : le propriétaire voit l'entrée « IA » active et le fil d'Ariane « Koklo > Réglages > IA »", async ({
  page,
}) => {
  await open(page);
  await expect(sidebarOf(page).getByRole("link", { name: "IA" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const crumbs = page.getByRole("navigation", { name: /breadcrumb|fil d'ariane/i });
  await expect(crumbs).toContainText("Réglages");
  await expect(crumbs.getByRole("link", { name: "Réglages" })).toHaveCount(0);
});

test("S-ai-settings : en-têtes de la route, Cache-Control: no-store et Referrer-Policy: no-referrer", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data", llm: {} });
  const response = await page.goto(PATH);
  expect(response?.headers()["cache-control"]).toBe("no-store");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  // Limités à cette route.
  const github = await page.goto("/github");
  expect(github?.headers()["referrer-policy"]).not.toBe("no-referrer");
});

test("S-ai-settings : un développeur n'a ni entrée, ni appel d'API llmCredential, et lit un refus sans action", async ({
  page,
}) => {
  const seen: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/llm-credentials")) seen.push(request.url());
  });
  await open(page, { list: "configured" }, "dev");
  await expect(page.getByText(/Cette page est réservée aux propriétaires/)).toBeVisible();
  await expect(sidebarOf(page).getByRole("link", { name: "IA" })).toHaveCount(0);
  await expect(page.getByLabel(FIELD)).toHaveCount(0);
  await expect(page.getByRole("button", { name: SAVE })).toHaveCount(0);
  expect(seen).toEqual([]);
  expect(await llmCallsSeen()).toEqual([]);
});

test("S-ai-settings : sans session /login, sans organisation active /organizations", async ({
  page,
}) => {
  await setScenario({ session: false, projects: "data" });
  await page.goto(PATH);
  await expect(page).toHaveURL(/\/login/);
  await setScenario({ session: true, projects: "data", activeOrganization: false });
  await page.goto(PATH);
  await expect(page).toHaveURL(/\/organizations$/);
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même écran, un test par comportement
test.describe("la clé n'existe plus nulle part après l'envoi", () => {
  /** Tout ce que la page a émis ou affiché, hors corps du PUT, ne doit pas contenir la clé. */
  async function expectNoTrace(page: Page, requests: Request[], consoleLines: string[]) {
    for (const request of requests) {
      expect(request.url()).not.toContain(E2E_SECRET);
      expect(JSON.stringify(await request.allHeaders())).not.toContain(E2E_SECRET);
      if (!(request.method() === "PUT" && request.url().includes("/llm-credentials/"))) {
        expect(request.postData() ?? "").not.toContain(E2E_SECRET);
      }
    }
    expect(await page.content()).not.toContain(E2E_SECRET);
    expect(
      await page
        .locator("input")
        .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value)),
    ).not.toContain(E2E_SECRET);
    expect(
      await page.evaluate(() =>
        JSON.stringify([{ ...localStorage }, { ...sessionStorage }, location.href, history.state]),
      ),
    ).not.toContain(E2E_SECRET);
    expect(consoleLines.join("\n")).not.toContain(E2E_SECRET);
    expect(await llmSecretLeaks()).toBe(0);
  }

  function watch(page: Page) {
    const requests: Request[] = [];
    const consoleLines: string[] = [];
    page.on("request", (request) => requests.push(request));
    page.on("console", (message) => consoleLines.push(message.text()));
    page.on("pageerror", (error) => consoleLines.push(String(error)));
    return { requests, consoleLines };
  }

  test("succès : PUT puis verify, la valeur n'est que dans le corps du PUT", async ({ page }) => {
    const { requests, consoleLines } = watch(page);
    await open(page, { list: "absent" });
    await fillAndSend(page);
    await expect(
      page.getByText(`Clé enregistrée et vérifiée (modèle ${E2E_MODEL}).`),
    ).toBeVisible();
    const calls = (await llmCallsSeen()).filter((call) => call.method !== "GET");
    expect(
      calls.map((call) => `${call.method} ${call.path.split("/").slice(-2).join("/")}`),
    ).toEqual(["PUT llm-credentials/anthropic", "POST anthropic/verify"]);
    expect(calls[0]?.body).toMatchObject({ apiKey: E2E_SECRET });
    expect(JSON.stringify(calls[1]?.body)).not.toContain(E2E_SECRET);
    await expectNoTrace(page, requests, consoleLines);
    await page.reload();
    await expectNoTrace(page, requests, consoleLines);
    await expect(page.getByText("Configurée", { exact: true })).toBeVisible();
  });

  test("échec réseau du PUT : champ vidé, ressaisie demandée, aucune trace, aucun rejeu", async ({
    page,
  }) => {
    const { requests, consoleLines } = watch(page);
    await open(page, { list: "absent" });
    await page.route("**/llm-credentials/anthropic", (route) => route.abort("connectionreset"));
    await fillAndSend(page);
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText(
      "saisissez de nouveau la clé",
    );
    await expect(keyField(page)).toHaveValue("");
    await page.waitForTimeout(500);
    await expectNoTrace(page, requests, consoleLines);
    await expect(page.getByRole("button", { name: "Réessayer" })).toHaveCount(0);
  });

  for (const { name, llm, text } of [
    {
      name: "503",
      llm: { set: "encryption" },
      text: "Le coffre des clés n'est pas disponible. Réessayez plus tard.",
    },
    { name: "500", llm: { set: "internal" }, text: "Impossible d'enregistrer la clé." },
    { name: "422", llm: { set: "validation" }, text: "Cette clé n'est pas valide." },
    {
      name: "clé refusée",
      llm: { verify: "auth" },
      text: "Clé enregistrée, mais refusée par le fournisseur",
    },
    {
      name: "quota",
      llm: { verify: "rateLimited" },
      text: "Trop de vérifications pour le moment.",
    },
  ] as Array<{ name: string; llm: LlmScenario["llm"]; text: string }>) {
    test(`issue « ${name} » : message dédié, champ vidé, aucune trace de la clé`, async ({
      page,
    }) => {
      const { requests, consoleLines } = watch(page);
      await open(page, { list: "absent", ...llm });
      await fillAndSend(page);
      await expect(page.getByText(text).first()).toBeVisible();
      expect(
        await page
          .locator("input[type=password]")
          .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value)),
      ).toEqual(expect.not.arrayContaining([E2E_SECRET]));
      await expectNoTrace(page, requests, consoleLines);
    });
  }

  test("le champ est un vrai champ mot de passe, rempli sans autocomplétion", async ({ page }) => {
    await open(page);
    const field = keyField(page);
    await expect(field).toHaveAttribute("type", "password");
    await expect(field).toHaveAttribute("autocomplete", "off");
    await expect(field).toHaveAttribute("maxlength", "512");
    await expect(field).toHaveAttribute("name", "llm-secret");
  });
});

for (const theme of ["light", "dark"] as Theme[]) {
  for (const { name, llm, expected } of [
    {
      name: "saved",
      llm: { list: "absent" },
      expected: `Clé enregistrée et vérifiée (modèle ${E2E_MODEL}).`,
    },
    {
      name: "refused",
      llm: { list: "absent", verify: "auth" },
      expected: "Clé enregistrée, mais refusée par le fournisseur",
    },
    {
      name: "rate-limited",
      llm: { list: "absent", verify: "rateLimited" },
      expected: "Trop de vérifications pour le moment.",
    },
    {
      name: "save-failed",
      llm: { list: "absent", set: "internal" },
      expected: "Impossible d'enregistrer la clé.",
    },
    {
      name: "vault-unavailable",
      llm: { list: "absent", set: "encryption" },
      expected: "Le coffre des clés n'est pas disponible.",
    },
  ] as Array<{ name: string; llm: LlmScenario["llm"]; expected: string }>) {
    test(`S-ai-settings résultat ${name} (${theme}) : message, axe et capture`, async ({
      page,
    }) => {
      await open(page, llm);
      if (theme === "dark") await switchToDark(page);
      await fillAndSend(page);
      await expect(page.getByText(expected).first()).toBeVisible();
      await settle(page);
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
      await shot(page, `result-${name}`, theme);
    });
  }
}

test("S-ai-settings : « Vérifier à nouveau » ne rappelle que verify", async ({ page }) => {
  await open(page, { list: "configured" });
  await page.getByRole("button", { name: "Vérifier à nouveau" }).click();
  await expect(page.getByText(/Vérifiée à l'instant avec le modèle/)).toBeVisible();
  const calls = (await llmCallsSeen()).filter((call) => call.method !== "GET");
  expect(calls.map((call) => call.method)).toEqual(["POST"]);
});

test("S-ai-settings : illisible à la vérification -> formulaire de remplacement ouvert", async ({
  page,
}) => {
  await open(page, { list: "configured", verify: "undecryptable" });
  await page.getByRole("button", { name: "Vérifier à nouveau" }).click();
  await expect(page.getByText("Illisible : à saisir à nouveau")).toBeVisible();
  await expect(keyField(page)).toBeVisible();
});

test("S-ai-settings : retrait avec confirmation en ligne, focus sur « Garder la clé », puis carte absente", async ({
  page,
}) => {
  await open(page, { list: "configured" });
  await page.getByRole("button", { name: "Retirer la clé" }).click();
  const group = page.getByRole("group", { name: "Confirmer le retrait de la clé" });
  await expect(group).toBeVisible();
  await expect(group.getByRole("button", { name: "Garder la clé" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(group).toHaveCount(0);
  await page.getByRole("button", { name: "Retirer la clé" }).click();
  await group.getByRole("button", { name: "Retirer la clé" }).click();
  await expect(page.getByText("Non configurée")).toBeVisible();
  await expect(keyField(page)).toBeFocused();
  expect((await llmCallsSeen()).filter((call) => call.method === "DELETE")).toHaveLength(1);
});

test("S-ai-settings : retrait, capture de la confirmation", async ({ page }) => {
  await open(page, { list: "configured" });
  await page.getByRole("button", { name: "Retirer la clé" }).click();
  await expect(page.getByRole("group", { name: "Confirmer le retrait de la clé" })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
  await shot(page, "remove-confirm", "light");
});

test.describe("375 px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const { state, llm } of [
    { state: "absent", llm: { list: "absent" } },
    { state: "configured", llm: { list: "configured" } },
  ] as Array<{ state: string; llm: LlmScenario["llm"] }>) {
    test(`${state} : aucun défilement horizontal, cibles de 44 px, capture`, async ({ page }) => {
      await open(page, llm);
      await expect(page.getByRole("heading", { level: 2, name: "Anthropic" })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      for (const button of await page
        .getByRole("button", {
          name: /Enregistrer et vérifier|Vérifier à nouveau|Remplacer la clé|Retirer la clé/,
        })
        .all()) {
        const box = await button.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      await shot(page, state, "mobile");
    });
  }

  test("confirmation du retrait : « Garder la clé » en premier, boutons empilés", async ({
    page,
  }) => {
    await open(page, { list: "configured" });
    await page.getByRole("button", { name: "Retirer la clé" }).click();
    const group = page.getByRole("group", { name: "Confirmer le retrait de la clé" });
    const boxes = await group
      .getByRole("button")
      .evaluateAll((els) =>
        els.map((el) => ({ name: el.textContent?.trim(), top: el.getBoundingClientRect().top })),
      );
    expect(boxes.map((box) => box.name)).toEqual(["Garder la clé", "Retirer la clé"]);
    expect(boxes[0]?.top ?? 0).toBeLessThan(boxes[1]?.top ?? 0);
    await shot(page, "remove-confirm", "mobile");
  });
});

test.describe("mouvement réduit", () => {
  test.use({ reducedMotion: "reduce" });

  test("le chargement n'anime rien", async ({ page }) => {
    await open(page, { list: "loading" });
    await expect(page.getByText("Chargement des réglages de l'IA…")).toBeVisible();
    const animated = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations === Number.POSITIVE_INFINITY).length,
    );
    expect(animated).toBe(0);
    await releaseHeld();
  });
});

test.describe("lien depuis le cadrage (S-framing §4.5)", () => {
  const FRAMING = `/projects/${FEATURE_PROJECT_ID}/framing`;
  async function failFraming(page: Page, role: "owner" | "admin" | "dev") {
    await setScenario({ session: true, projects: "data", ai: "notConfigured", role });
    await page.goto(FRAMING);
    await page
      .getByRole("textbox", { name: /^Votre idée/ })
      .fill("Un portail pour réserver des créneaux en ligne.");
    await page.getByRole("button", { name: "Générer un brief avec l'IA" }).click();
    return page.getByRole("alert").filter({ hasText: UNCONFIGURED });
  }

  for (const role of ["owner", "admin"] as const) {
    test(`${role} : « Configurer l'IA » mène à /settings/ai`, async ({ page }) => {
      const alert = await failFraming(page, role);
      await expect(alert).toBeVisible();
      await expect(alert).not.toContainText("Demandez à un administrateur");
      await alert.getByRole("link", { name: "Configurer l'IA" }).click();
      await expect(page).toHaveURL(/\/settings\/ai$/);
      await expect(page.getByRole("heading", { level: 1, name: "IA" })).toBeVisible();
    });
  }

  test("développeur : texte inchangé, jamais de lien", async ({ page }) => {
    const alert = await failFraming(page, "dev");
    await expect(alert).toContainText(
      "Demandez à un administrateur de l'organisation d'ajouter la clé.",
    );
    await expect(alert.getByRole("link")).toHaveCount(0);
  });
});
