import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  AXE_TAGS,
  CAPTURES_DIR,
  type KanbanRole,
  proposalCallsSeen,
  setScenario,
  settle,
  specWritesSeen,
  switchToDark,
  type Theme,
} from "./support/helpers.ts";
import { FEATURE_PROJECT_ID } from "./support/stub-features.ts";
import type { ProposalsMode } from "./support/stub-proposals.ts";

/**
 * TK-99b, propositions de l'agent sur le Fonctionnel (design/screens/S-features.md v2.0). Pile locale : faux API avec
 * modèle simulé (support/stub-proposals.ts), navigateur réel ; jamais de fournisseur d'IA, de GitHub ni de Postgres.
 * Captures : design/screens/captures/S-features/proposals-<état>-<thème>.png (+ -mobile à 375 px).
 */
const PATH = `/projects/${FEATURE_PROJECT_ID}/spec/functional`;
const BUTTON = /Proposer avec l'agent|L'agent propose|Relire \d+ proposition/;
const MOBILE = { width: 375, height: 812 };

async function scenario(proposals: ProposalsMode, role?: KanbanRole): Promise<void> {
  await setScenario({ session: true, projects: "data", proposals, ...(role ? { role } : {}) });
}
const modal = (page: Page) => page.getByRole("dialog", { name: "Proposer avec l'agent" });
const review = (page: Page) => page.getByRole("region", { name: "Relecture des propositions" });
const trigger = (page: Page) => page.getByRole("button", { name: BUTTON }).first();

async function axeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
}

test("S-features agent : bouton, modale, lancement, premières propositions avant la fin, relecture, enregistrement", async ({
  page,
}) => {
  await scenario("none", "dev");
  await page.goto(PATH);
  await trigger(page).click();
  await expect(modal(page)).toBeVisible();
  await axeClean(page);
  expect((await proposalCallsSeen()).length).toBe(0);
  await modal(page).getByRole("button", { name: "Lancer" }).click();
  await expect(page).toHaveURL(/view=review/);
  await expect(page.getByText("L'agent rédige le cahier fonctionnel")).toBeVisible();
  // Les premières propositions arrivent avant la fin du lancement, puis le lancement se termine.
  await expect(review(page)).toBeVisible({ timeout: 15_000 });
  await expect(review(page).getByRole("status")).toContainText(/proposition/i, { timeout: 15_000 });
  await expect(review(page).getByRole("group", { name: "Mode relecture" })).toContainText(
    "12 propositions",
    {
      timeout: 20_000,
    },
  );
  await review(page)
    .getByRole("button", { name: /^Accepter/ })
    .click();
  const save = review(page).getByRole("button", { name: "Enregistrer 1 dans la spec" });
  await expect(save).toBeVisible();
  await save.click();
  await expect
    .poll(async () => (await specWritesSeen()).some((w) => w.kind === "submit"))
    .toBe(true);
  const submit = (await specWritesSeen()).find((w) => w.kind === "submit") as Record<
    string,
    unknown
  >;
  expect(submit.proposalIds).toHaveLength(1);
  await axeClean(page);
});

test("S-features agent : Échap ferme la modale et rend le focus au bouton", async ({ page }) => {
  await scenario("none", "dev");
  await page.goto(PATH);
  const button = trigger(page);
  await button.click();
  await expect(modal(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal(page)).toBeHidden();
  await expect(button).toBeFocused();
});

test("S-features agent : retour après départ, relecture ouverte une fois, « Quitter la relecture » ne la rouvre pas", async ({
  page,
}) => {
  await scenario("ready", "owner");
  await page.goto(PATH);
  await expect(page).toHaveURL(/view=review/);
  await expect(review(page)).toBeVisible();
  await page.getByRole("button", { name: "Quitter la relecture" }).click();
  await expect(page).not.toHaveURL(/view=review/);
  await expect(page.getByRole("button", { name: /Relire 12 propositions/ })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page).not.toHaveURL(/view=review/);
  await page.getByRole("button", { name: /Relire 12 propositions/ }).click();
  await expect(page).toHaveURL(/view=review/);
});

for (const role of ["client", "business"] as const) {
  test(`S-features agent : ${role}, aucun bouton ni appel d'écriture`, async ({ page }) => {
    await scenario("ready", role);
    await page.goto(PATH);
    await expect(page.getByRole("heading", { name: "Cahier fonctionnel", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: BUTTON })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Cadrer avec l'IA" })).toHaveCount(0);
    expect(await proposalCallsSeen()).toEqual([]);
  });
}

test("S-features agent : sortie hostile rendue en texte brut (aucun lien, image ni HTML)", async ({
  page,
}) => {
  await scenario("hostile", "dev");
  await page.goto(`${PATH}?view=review`);
  await expect(review(page)).toBeVisible();
  await expect(review(page).locator("a, [href], img")).toHaveCount(0);
  await expect(review(page)).toContainText("evil.example");
});

test("S-features agent : 400 propositions, groupes, moins de 300 lignes, défilement sans tâche longue", async ({
  page,
}) => {
  await scenario("volume", "dev");
  await page.goto(`${PATH}?view=review`);
  await expect(review(page)).toBeVisible();
  await expect(review(page).getByRole("button", { expanded: true }).first()).toBeVisible();
  expect(await review(page).locator("li").count()).toBeLessThan(300);
  const worst = await page.evaluate(async () => {
    let longest = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longest = Math.max(longest, entry.duration);
    });
    observer.observe({ entryTypes: ["longtask"] });
    for (let top = 0; top <= document.body.scrollHeight; top += 240) {
      window.scrollTo(0, top);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    }
    observer.disconnect();
    return longest;
  });
  expect(worst).toBeLessThan(50);
  await review(page)
    .getByRole("button", { name: /Accepter les 25 restantes/ })
    .first()
    .click();
  await expect(review(page).getByRole("status")).toContainText(/25 propositions acceptées dans/);
});

test("S-features agent : indisponible, bouton inerte avec sa raison", async ({ page }) => {
  await scenario("unavailable", "dev");
  await page.goto(PATH);
  const button = page.getByRole("button", { name: /Proposer avec l'agent/ }).first();
  await expect(button).toHaveAttribute("data-state", "unavailable");
  // Bouton inerte (aria-disabled) : le clic est forcé, il ouvre la bulle de la raison sans lancer rien.
  await button.click({ force: true });
  await expect(page.locator("p", { hasText: /Figez d'abord une version/ })).toBeVisible();
  await expect(modal(page)).toBeHidden();
});

test("S-features agent : 409 en cours (pas d'erreur bloquante) et clé absente (alerte dans la modale)", async ({
  page,
}) => {
  await scenario("inProgress", "dev");
  await page.goto(PATH);
  await trigger(page).click();
  await modal(page).getByRole("button", { name: "Lancer" }).click();
  await expect(page.getByText("Une génération est déjà en cours pour ce livrable.")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  await scenario("notConfigured", "dev");
  await page.goto(PATH);
  await trigger(page).click();
  await modal(page).getByRole("button", { name: "Lancer" }).click();
  await expect(modal(page).getByRole("alert")).toContainText("pas encore configurée");
});

type Shot = {
  name: string;
  mode: ProposalsMode;
  path?: string;
  reach?: (page: Page) => Promise<void>;
  visible: (page: Page) => Promise<void>;
};

const SHOTS: Shot[] = [
  {
    name: "idle",
    mode: "none",
    visible: (page) =>
      expect(page.getByRole("button", { name: /Proposer avec l'agent/ }).first()).toBeVisible(),
  },
  {
    name: "modal",
    mode: "none",
    reach: async (page) => {
      await trigger(page).click();
      await expect(modal(page)).toBeVisible();
    },
    visible: (page) => expect(modal(page).getByRole("radio").first()).toBeVisible(),
  },
  {
    name: "generating",
    mode: "generating",
    path: `${PATH}?view=review`,
    visible: (page) =>
      expect(page.getByRole("button", { name: "Annuler l'attente" })).toBeVisible(),
  },
  {
    name: "running",
    mode: "generating",
    visible: (page) => expect(page.getByRole("button", { name: /L'agent propose/ })).toBeVisible(),
  },
  {
    name: "ready",
    mode: "ready",
    reach: async (page) => {
      await page.getByRole("button", { name: "Quitter la relecture" }).click();
    },
    visible: (page) =>
      expect(page.getByRole("button", { name: /Relire 12 propositions/ })).toBeVisible(),
  },
  {
    name: "unavailable",
    mode: "unavailable",
    visible: (page) =>
      expect(page.getByRole("button", { name: /Proposer avec l'agent/ }).first()).toHaveAttribute(
        "data-state",
        "unavailable",
      ),
  },
  {
    name: "review-flat",
    mode: "ready",
    path: `${PATH}?view=review`,
    visible: (page) => expect(review(page)).toBeVisible(),
  },
  {
    name: "review-volume",
    mode: "volume",
    path: `${PATH}?view=review`,
    visible: (page) =>
      expect(review(page).getByRole("button", { expanded: true }).first()).toBeVisible(),
  },
  {
    name: "launch-error",
    mode: "notConfigured",
    reach: async (page) => {
      await trigger(page).click();
      await modal(page).getByRole("button", { name: "Lancer" }).click();
    },
    visible: (page) => expect(modal(page).getByRole("alert")).toBeVisible(),
  },
];

for (const shot of SHOTS) {
  for (const theme of ["light", "dark"] as const satisfies Theme[]) {
    for (const mobile of [false, true]) {
      const label = `${shot.name} ${theme}${mobile ? " 375 px" : ""}`;
      test(`S-features agent capture : ${label}, axe sans violation`, async ({ page }) => {
        if (mobile) await page.setViewportSize(MOBILE);
        await scenario(shot.mode, "dev");
        await page.goto(shot.path ?? PATH);
        if (theme === "dark") await switchToDark(page);
        if (shot.reach) await shot.reach(page);
        await shot.visible(page);
        await settle(page);
        await axeClean(page);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        await page.screenshot({
          path: `${CAPTURES_DIR}/S-features/proposals-${shot.name}-${theme}${mobile ? "-mobile" : ""}.png`,
          fullPage: true,
        });
      });
    }
  }
}
