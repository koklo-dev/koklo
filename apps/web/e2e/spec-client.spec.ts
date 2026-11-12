import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  AXE_TAGS,
  CAPTURES_DIR,
  clientCallsSeen,
  setScenario,
  settle,
  switchToDark,
  type Theme,
} from "./support/helpers.ts";
import type { ClientSpaceMode } from "./support/stub-client-space.ts";
import { FEATURE_PROJECT_ID } from "./support/stub-features.ts";

/**
 * TK-104 lot B, vue client du cahier (design/screens/S-spec-functional.md §11, maquette 10 l.171-224, 286-330) : les
 * quatre onglets, la décision et ses confirmations, « Valider le cahier », le bandeau d'éléments modifiés, le business
 * sans action, « Relancer » côté équipe. Clair, sombre et 375 px, axe sans violation. Pile locale : faux API.
 * Captures dans design/screens/captures/S-spec-functional/client-<état>-<thème>[-mobile].png.
 */
const PATH = `/projects/${FEATURE_PROJECT_ID}/spec/functional`;
const VIEWPORTS = [
  { name: "", width: 1280, height: 800 },
  { name: "-mobile", width: 375, height: 800 },
] as const;
const THEMES: Theme[] = ["light", "dark"];
const FICHE = "Fiche de la fonctionnalité";

interface View {
  name: string;
  tab: string;
  mode?: ClientSpaceMode;
  role?: "client" | "business";
  /** Met l'écran dans l'état à capturer et vérifie qu'il y est. */
  prepare: (page: Page) => Promise<void>;
}

async function validateFlowAndRequestAnother(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Valider ce parcours" }).first().click();
  await expect(page.getByText("Parcours validé.")).toBeVisible();
  await page.getByRole("button", { name: "Demander un changement" }).first().click();
  await page
    .getByLabel("Que faut-il changer dans ce parcours ?")
    .fill("Choisir le coiffeur d'abord");
  await page.getByRole("button", { name: "Envoyer à l'équipe" }).click();
  await expect(page.getByText("Changement demandé à l'équipe pour ce parcours.")).toBeVisible();
}

const VIEWS: View[] = [
  {
    name: "features",
    tab: "features",
    prepare: async (page) => {
      await page.getByRole("button", { name: /F-001/ }).click();
      await expect(page.getByRole("complementary", { name: FICHE })).toBeVisible();
      await expect(page.getByRole("button", { name: "Valider", exact: true })).toBeVisible();
    },
  },
  { name: "flows", tab: "flows", prepare: validateFlowAndRequestAnother },
  {
    name: "rules",
    tab: "rules",
    prepare: async (page) => {
      await expect(page.getByRole("button", { name: "Valider les règles" })).toBeVisible();
    },
  },
  {
    name: "roles",
    tab: "roles",
    prepare: async (page) => {
      await page.getByRole("button", { name: "Valider les rôles" }).click();
      await expect(page.getByText("Validé. Merci.")).toBeVisible();
    },
  },
  {
    name: "empty",
    tab: "features",
    mode: "empty",
    prepare: async (page) => {
      await expect(page.getByText("Rien à valider pour l'instant")).toBeVisible();
    },
  },
  {
    name: "business",
    tab: "features",
    role: "business",
    prepare: async (page) => {
      await expect(page.getByRole("note")).toContainText("Vous consultez le cahier.");
      await page.getByRole("button", { name: /F-001/ }).click();
      await expect(page.getByRole("button", { name: "Valider", exact: true })).toHaveCount(0);
    },
  },
];

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const view of VIEWS) {
      test(`S-spec-functional client-${view.name} (${theme}${viewport.name}) : état, axe sans violation, capture`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await setScenario({
          session: true,
          projects: "data",
          role: view.role ?? "client",
          clientSpace: view.mode ?? "ready",
        });
        if (theme === "dark") {
          await page.goto(PATH);
          await switchToDark(page);
        }
        await page.goto(`${PATH}?tab=${view.tab}`);
        await view.prepare(page);
        await expect(page.locator("html")).toHaveClass(
          theme === "dark" ? /dark/ : /^((?!dark).)*$/,
        );
        await settle(page);
        await page.screenshot({
          path: `${CAPTURES_DIR}/S-spec-functional/client-${view.name}-${theme}${viewport.name}.png`,
          fullPage: true,
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        ).toBeLessThanOrEqual(0);
        const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(results.violations, JSON.stringify(results.violations.map((v) => v.id))).toEqual([]);
      });
    }
  }
}

/** Traite les cinq unités du scénario « empty » : trois parcours, les règles, les rôles. */
async function treatEverything(page: Page): Promise<void> {
  await page.goto(`${PATH}?tab=flows`);
  for (let left = 3; left > 0; left--) {
    await page.getByRole("button", { name: "Valider ce parcours" }).first().click();
    await expect(page.getByRole("button", { name: "Valider ce parcours" })).toHaveCount(left - 1);
  }
  await page.getByRole("link", { name: /Règles métier/ }).click();
  await page.getByRole("button", { name: "Valider les règles" }).click();
  await expect(page.getByText("Validé. Merci.")).toBeVisible();
  await page.getByRole("link", { name: /Rôles et permissions/ }).click();
  await page.getByRole("button", { name: "Valider les rôles" }).click();
  await expect(page.getByText("Validé. Merci.")).toBeVisible();
}

test("client : valider une fonctionnalité annonce la suivante et y rend le focus", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data", role: "client", clientSpace: "ready" });
  await page.goto(`${PATH}?tab=features`);
  await page.getByRole("button", { name: /F-001/ }).click();
  await page.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Validée. Suivante : F-002" }),
  ).toBeAttached();
  await expect(
    page.getByRole("heading", { level: 2, name: "Rappel par SMS avant le rendez-vous" }),
  ).toBeFocused();
  const [call] = await clientCallsSeen();
  expect(call).toMatchObject({
    targetKind: "feature",
    targetRef: "F-001",
    status: "approved",
    version: "v1",
  });
  expect(Object.keys(call ?? {})).not.toContain("sha");
});

test("client : demander un changement envoie le texte et Échap referme le formulaire", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data", role: "client", clientSpace: "ready" });
  await page.goto(`${PATH}?tab=features`);
  await page.getByRole("button", { name: /F-001/ }).click();
  await page.getByRole("button", { name: "Demander un changement" }).click();
  await expect(page.getByLabel("Que faut-il changer ?")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Que faut-il changer ?")).toHaveCount(0);
  await page.getByRole("button", { name: "Demander un changement" }).click();
  await page.getByLabel("Que faut-il changer ?").fill("Jusqu'à 1 h avant");
  await page.getByRole("button", { name: "Envoyer à l'équipe" }).click();
  await expect.poll(async () => (await clientCallsSeen()).length).toBe(1);
  expect((await clientCallsSeen())[0]).toMatchObject({
    status: "changes_requested",
    comment: "Jusqu'à 1 h avant",
  });
});

test("client : « Annuler » remet un parcours à valider", async ({ page }) => {
  await setScenario({ session: true, projects: "data", role: "client", clientSpace: "ready" });
  await page.goto(`${PATH}?tab=flows`);
  await page.getByRole("button", { name: "Valider ce parcours" }).first().click();
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("button", { name: "Valider ce parcours" })).toHaveCount(3);
  expect((await clientCallsSeen()).at(-1)).toMatchObject({
    targetKind: "flow",
    status: "withdrawn",
  });
});

test("client : bandeau d'éléments modifiés, « Valider le cahier » inactif puis actif", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data", role: "client", clientSpace: "changed" });
  await page.goto(`${PATH}?tab=flows`);
  await expect(page.getByText("2 éléments ont changé depuis votre validation.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Valider le cahier" })).toBeDisabled();
  await expect(page.getByText("Traitez chaque onglet pour finir")).toBeVisible();
});

test("client : « Valider le cahier » devient actif quand tout est traité, le serveur peut refuser", async ({
  page,
}) => {
  await setScenario({ session: true, projects: "data", role: "client", clientSpace: "empty" });
  await treatEverything(page);
  await expect(page.getByRole("button", { name: "Valider le cahier" })).toBeEnabled();
  await page.getByRole("button", { name: "Valider le cahier" }).click();
  await expect(page.getByText("Cahier validé", { exact: true })).toBeVisible();
  expect((await clientCallsSeen()).at(-1)).toMatchObject({
    targetKind: "deliverable",
    targetRef: "functional",
    status: "approved",
  });
});

test("client : refus serveur « Il reste des éléments à traiter »", async ({ page }) => {
  await setScenario({ session: true, projects: "data", role: "client", clientSpace: "refused" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${PATH}?tab=features`);
  await page.getByRole("button", { name: /F-001/ }).click();
  await page.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Validée" })).toBeAttached();
  await expect(page.getByRole("button", { name: "Valider le cahier" })).toBeDisabled();
});

test("équipe : « Relancer Marie » prévient le client, une fois par jour", async ({ page }) => {
  await setScenario({
    session: true,
    projects: "data",
    role: "owner",
    clientSpace: "ready",
    spec: "ready",
  });
  await page.goto(PATH);
  await page.getByRole("button", { name: "Relancer Marie" }).click();
  await expect(page.getByText("Rappel envoyé")).toBeVisible();
  await page.getByRole("button", { name: "Relancer Marie" }).click();
  await expect(page.getByText("Le client a déjà été relancé aujourd'hui")).toBeVisible();
});

test("équipe sans client : « Valider à la place du client » ouvre la vue client (D1) qui garde ses onglets", async ({
  page,
}) => {
  await setScenario({
    session: true,
    projects: "data",
    role: "owner",
    clientSpace: "ready",
    hasClient: false,
    spec: "ready",
  });
  await page.goto(PATH);
  await page.getByRole("link", { name: "Valider à la place du client" }).click();
  await expect(page.getByRole("note")).toContainText("Aucun client n'est invité");
  await page.getByRole("link", { name: /Parcours/ }).click();
  await expect(page).toHaveURL(/tab=flows&vue=client/);
  await expect(page.getByRole("button", { name: "Valider ce parcours" }).first()).toBeVisible();
});
