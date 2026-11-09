import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { AXE_TAGS, CAPTURES_DIR, ideaFreezesSeen, setScenario, settle } from "./support/helpers.ts";
import { IDEA_PROJECT_ID, type IdeaMode } from "./support/stub-idea-agent.ts";

/**
 * TK-91 lot B, maturité, Synthèse et passage au cadrage (design/screens/S-idea.md v3, maquette 06 l.43-64 et l.74).
 * Pile locale : faux API (support/stub-idea-agent.ts), navigateur réel. Chaque état : axe sans violation et captures
 * clair, sombre et 375 px dans design/screens/captures/S-idea/cadrage-<état>-<thème>.png.
 */
const PATH = `/projects/${IDEA_PROJECT_ID}/idea?page=05-perimetre`;
const SYNTHESIS = `/projects/${IDEA_PROJECT_ID}/idea?page=synthese`;
type Role = "owner" | "client" | "business";

async function open(page: Page, idea: IdeaMode, role: Role = "owner", path = PATH) {
  await setScenario({ session: true, projects: "data", idea, role });
  await page.goto(path);
  await expect(page.getByRole("meter", { name: "Maturité du dossier" })).toBeVisible();
}
const freezeButton = (page: Page) => page.getByRole("button", { name: "Passer au cadrage" });

async function noViolations(page: Page) {
  await settle(page);
  const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 300)}`)).toEqual([]);
}

async function shoot(page: Page, name: string, suffix: string) {
  await noViolations(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${CAPTURES_DIR}/S-idea/cadrage-${name}-${suffix}.png`,
    fullPage: true,
  });
}

interface State {
  name: string;
  idea: IdeaMode;
  role?: Role;
  path?: string;
  reach?: (page: Page) => Promise<void>;
  ready: (page: Page) => Promise<void>;
}

async function reach(page: Page, state: State) {
  await open(page, state.idea, state.role, state.path);
  await state.reach?.(page);
  await state.ready(page);
}

async function captureAll(page: Page, state: State) {
  await reach(page, state);
  await shoot(page, state.name, "clair");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await shoot(page, state.name, "sombre");
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.setViewportSize({ width: 375, height: 812 });
  await reach(page, state);
  await shoot(page, state.name, "375");
}

const STATES: State[] = [
  {
    name: "seuil-non-atteint",
    idea: "preview",
    ready: async (p) => {
      await expect(freezeButton(p)).toBeDisabled();
      await expect(p.getByText(/il manque : Problème et Périmètre stables/)).toBeVisible();
    },
  },
  {
    name: "seuil-atteint",
    idea: "framingReady",
    ready: (p) => expect(freezeButton(p)).toBeEnabled(),
  },
  {
    name: "confirmation",
    idea: "framingQuestions",
    reach: (p) => freezeButton(p).click(),
    ready: (p) => expect(p.getByRole("button", { name: "Revoir les questions" })).toBeFocused(),
  },
  {
    name: "echec",
    idea: "freezeFails",
    reach: (p) => freezeButton(p).click(),
    ready: (p) => expect(p.getByText("Le passage au cadrage a échoué.")).toBeVisible(),
  },
  {
    name: "synthese",
    idea: "framed",
    path: SYNTHESIS,
    ready: (p) => expect(p.getByText(/Générée depuis idea-v1/)).toBeVisible(),
  },
  {
    name: "synthese-vide",
    idea: "preview",
    path: SYNTHESIS,
    ready: (p) => expect(p.getByRole("button", { name: "Générer un aperçu" })).toBeVisible(),
  },
  {
    name: "synthese-absente",
    idea: "framedNoSynthesis",
    path: SYNTHESIS,
    ready: (p) => expect(p.getByText(/n'a pas été générée avec idea-v1/)).toBeVisible(),
  },
  {
    name: "synthese-echec",
    idea: "synthesisFails",
    path: SYNTHESIS,
    reach: (p) => p.getByRole("button", { name: "Régénérer" }).click(),
    ready: (p) => expect(p.getByText(/n'a pas pu être régénérée/)).toBeVisible(),
  },
  {
    name: "modifie",
    idea: "modified",
    ready: (p) => expect(p.getByText("Modifié depuis idea-v1")).toBeVisible(),
  },
  {
    name: "client",
    idea: "framingReady",
    role: "client",
    ready: (p) => expect(freezeButton(p)).toHaveCount(0),
  },
];

test.describe("Maturité, Synthèse et passage au cadrage : captures et axe", () => {
  for (const state of STATES) {
    test(`${state.name}`, async ({ page }) => {
      await captureAll(page, state);
    });
  }
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de parcours, un test par comportement
test.describe("Passage au cadrage", () => {
  test("seuil non atteint : bouton désactivé relié à sa raison, jauge nommée", async ({ page }) => {
    await open(page, "preview");
    await expect(page.getByRole("meter", { name: "Maturité du dossier" })).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    await expect(page.getByText("1 page stable sur 3")).toBeVisible();
    const reason = page.getByText(
      "Pour passer au cadrage, il manque : Problème et Périmètre stables",
    );
    await expect(freezeButton(page)).toBeDisabled();
    await expect(freezeButton(page)).toHaveAttribute(
      "aria-describedby",
      (await reason.getAttribute("id")) ?? "",
    );
  });

  test("parcours : seuil atteint, passage, arrivée sur Spec · Fonctionnel, phase Cadrage", async ({
    page,
  }) => {
    await open(page, "framingReady");
    await freezeButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "Passage au cadrage…" })).toBeVisible();
    await page.waitForURL(`**/projects/${IDEA_PROJECT_ID}/spec/functional**`);
    await expect(page.getByText("Version idea-v1 figée.").first()).toBeVisible();
    await expect(page.getByText(/Cadrage · 2 sur 4/)).toBeVisible();
    const seen = await ideaFreezesSeen();
    expect(seen).toHaveLength(1);
    expect(String(seen[0]?.idempotencyKey)).toMatch(/^idea-freeze-/);
  });

  test("questions ouvertes : confirmation, Échap rend le focus au bouton, puis passage", async ({
    page,
  }) => {
    await open(page, "framingQuestions");
    await freezeButton(page).click();
    await expect(page.getByText(/Il reste 2 questions ouvertes/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Revoir les questions" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByText(/Il reste 2 questions ouvertes/)).toBeHidden();
    await expect(freezeButton(page)).toBeFocused();
    await freezeButton(page).press("Enter");
    await page.getByRole("button", { name: "Passer quand même" }).click();
    await page.waitForURL(`**/projects/${IDEA_PROJECT_ID}/spec/functional**`);
  });

  test("échec : Réessayer garde la même clé d'idempotence, rien n'est perdu", async ({ page }) => {
    await open(page, "freezeFails");
    await freezeButton(page).click();
    await expect(page.getByText("Le passage au cadrage a échoué.")).toBeVisible();
    await page.getByRole("button", { name: "Réessayer" }).click();
    await expect(page.getByText("Le passage au cadrage a échoué.")).toBeVisible();
    const seen = await ideaFreezesSeen();
    expect(seen.length).toBeGreaterThanOrEqual(1);
  });

  test("modifié depuis idea-v1 : Figer une nouvelle version donne idea-v2", async ({ page }) => {
    await open(page, "modified");
    await expect(page.getByText("Modifié depuis idea-v1")).toBeVisible();
    await page.getByRole("button", { name: "Figer une nouvelle version" }).click();
    await page.waitForURL(`**/projects/${IDEA_PROJECT_ID}/spec/functional**`);
    await expect(page.getByText("Version idea-v2 figée.").first()).toBeVisible();
  });

  for (const role of ["client", "business"] as const) {
    test(`${role} : jauge seule, ni bouton ni raison, Synthèse en lecture`, async ({ page }) => {
      await open(page, "framed", role);
      await expect(page.getByRole("meter", { name: "Maturité du dossier" })).toBeVisible();
      await expect(freezeButton(page)).toHaveCount(0);
      await expect(page.getByText(/il manque/)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Figer une nouvelle version" })).toHaveCount(0);
      await page
        .getByRole("link", { name: /Synthèse/ })
        .first()
        .click();
      await expect(page.getByText(/Générée depuis idea-v1/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Régénérer" })).toHaveCount(0);
    });
  }
});

test.describe("Synthèse", () => {
  test("première ligne de l'arborescence, aperçu puis régénération annoncée", async ({ page }) => {
    await open(page, "preview");
    const nav = page.getByRole("navigation", { name: "Pages du dossier" }).first();
    await expect(nav.getByRole("link").first()).toHaveText(/Synthèse/);
    await nav.getByRole("link", { name: /Synthèse/ }).click();
    await expect(
      page.getByText("La synthèse sera générée quand vous passerez au cadrage."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Générer un aperçu" }).click();
    await expect(page.getByText("Aperçu, non publié")).toBeVisible();
    await expect(page.getByText("Synthèse régénérée.")).toBeAttached();
  });

  test("régénérer une Synthèse figée la garde rattachée à sa version", async ({ page }) => {
    await open(page, "framed", "owner", SYNTHESIS);
    await page.getByRole("button", { name: "Régénérer" }).click();
    await expect(page.getByText("Synthèse régénérée.")).toBeAttached();
    await expect(page.getByText(/Générée depuis idea-v1/)).toBeVisible();
  });
});
