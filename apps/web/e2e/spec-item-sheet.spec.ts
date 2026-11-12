import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  AXE_TAGS,
  CAPTURES_DIR,
  hydrated,
  setScenario,
  settle,
  switchToDark,
} from "./support/helpers.ts";
import { FEATURE_PROJECT_ID } from "./support/stub-features.ts";

/**
 * TK-101, panneau d'édition `SpecItemSheet` (design/screens/S-spec-item-sheet.md, maquette 16) : les 4 modes
 * (création, préremplie, modification d'un livrable validé, erreurs), en clair, en sombre et à 375 px, sans
 * violation axe, avec les captures dans design/screens/captures/S-spec-item-sheet/<mode>-<light|dark|mobile>.png.
 * Faux API (support/stub-spec-item.ts) : jamais de fournisseur d'IA, de GitHub ni de base.
 */
const PATH = `/projects/${FEATURE_PROJECT_ID}/spec/functional`;
const dialogOf = (page: Page) => page.getByRole("dialog");

type Mode = "create" | "filled" | "edit" | "err";

async function open(page: Page, mode: Mode, dark = false): Promise<void> {
  await setScenario({
    session: true,
    projects: "data",
    write: "ok",
    validated: mode === "edit",
    references: true,
  });
  if (dark) {
    // Le panneau masque la barre aux technologies d'assistance : le thème se pose avant de l'ouvrir.
    await page.goto(PATH);
    await hydrated(page);
    await switchToDark(page);
  }
  await page.goto(mode === "edit" ? `${PATH}?edit=F-001` : `${PATH}?new=1`);
  const dialog = dialogOf(page);
  await expect(dialog).toBeVisible();
  if (mode === "edit")
    await expect(dialog.getByRole("textbox", { name: /^Titre\s*obligatoire/ })).toHaveValue(
      "Connexion par e-mail",
    );
  if (mode === "filled") {
    await dialog
      .getByRole("textbox", { name: "Description pour l'agent" })
      .fill("une liste d'attente");
    await dialog.getByRole("button", { name: "Préremplir" }).click();
    await expect(dialog.getByText("Préremplie par l'agent.")).toBeVisible();
  }
  if (mode === "err") {
    await dialog.getByRole("button", { name: /^Enregistrer/ }).click();
    await expect(dialog.getByText(/2 champs obligatoires sont vides/)).toBeVisible();
  }
}

const MODES: Mode[] = ["create", "filled", "edit", "err"];
const VARIANTS = [
  { suffix: "light", dark: false, width: 1280, height: 900 },
  { suffix: "dark", dark: true, width: 1280, height: 900 },
  { suffix: "mobile", dark: false, width: 375, height: 800 },
] as const;

for (const mode of MODES) {
  for (const { suffix, dark, width, height } of VARIANTS) {
    test(`S-spec-item-sheet ${mode}-${suffix} : axe, 375 px sans défilement horizontal, capture`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await open(page, mode, dark);
      await settle(page);
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations, JSON.stringify(results.violations.map((v) => v.id))).toEqual([]);
      // Correction 1 : le pied reste dans le panneau, les alertes ne sont pas écrasées, l'identifiant est sur la ligne.
      const geometry = await dialogOf(page).evaluate((panel) => {
        const frame = panel.getBoundingClientRect();
        const footer = panel.querySelector("form > div:last-child")?.getBoundingClientRect();
        const squashed = [...panel.querySelectorAll("[data-slot=inline-alert]")].filter(
          (node) => node.scrollHeight > node.clientHeight + 1,
        ).length;
        return {
          left: (footer?.left ?? 0) - frame.left,
          right: frame.right - (footer?.right ?? 0),
          squashed,
          header: panel.querySelector("form > div")?.getBoundingClientRect().height ?? 0,
        };
      });
      expect(Math.abs(geometry.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.right)).toBeLessThanOrEqual(1);
      expect(geometry.squashed).toBe(0);
      if (width >= 768) expect(geometry.header).toBeLessThan(80);
      if (width === 375) {
        const box = await dialogOf(page).boundingBox();
        expect(box?.width).toBeCloseTo(375, 0);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        expect(overflow).toBe(false);
      }
      await page.screenshot({ path: `${CAPTURES_DIR}/S-spec-item-sheet/${mode}-${suffix}.png` });
    });
  }
}

test("création : Échap sans saisie ferme ; avec saisie, confirmation « Continuer la saisie »", async ({
  page,
}) => {
  await open(page, "create");
  await page.keyboard.press("Escape");
  await expect(dialogOf(page)).toHaveCount(0);
  await page.goto(`${PATH}?new=1`);
  await dialogOf(page)
    .getByRole("textbox", { name: /^Titre\s*obligatoire/ })
    .fill("Brouillon");
  await page.keyboard.press("Escape");
  const confirm = page.getByRole("alertdialog", { name: "Fermer sans enregistrer ?" });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Continuer la saisie" })).toBeFocused();
  await confirm.getByRole("button", { name: "Continuer la saisie" }).click();
  await expect(dialogOf(page)).toBeVisible();
});

test("liens : l'autocomplétion trouve un élément hors des pages chargées (R-0987)", async ({
  page,
}) => {
  await open(page, "create");
  const input = dialogOf(page).getByRole("combobox", { name: "Liens : ajouter" });
  await input.fill("R-098");
  const option = page.getByRole("option", { name: /R-0987/ });
  await expect(option).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(dialogOf(page).getByRole("button", { name: "Retirer R-0987" })).toBeVisible();
});

test("enregistrement : un toast avec le commit, puis le panneau se ferme", async ({ page }) => {
  await open(page, "create");
  const dialog = dialogOf(page);
  await dialog
    .getByRole("textbox", { name: /^Titre\s*obligatoire/ })
    .fill("Notifications par e-mail");
  await dialog
    .getByRole("radiogroup", { name: /^Priorité/ })
    .getByRole("radio", { name: "Importante" })
    .click();
  await dialog.getByRole("button", { name: /^Enregistrer/ }).click();
  await expect(page.getByText(/enregistrée dans la spec · commit [0-9a-f]{7}/).first()).toBeVisible(
    {
      timeout: 20_000,
    },
  );
  await expect(dialogOf(page)).toHaveCount(0);
});

test("modification : suppression, la confirmation liste ce qui renvoie à l'élément", async ({
  page,
}) => {
  await open(page, "edit");
  await dialogOf(page).getByRole("button", { name: "Supprimer", exact: true }).click();
  const group = dialogOf(page).getByRole("group", { name: "Confirmer la suppression" });
  await expect(group.getByText("R-004")).toBeVisible();
  await page.screenshot({ path: `${CAPTURES_DIR}/S-spec-item-sheet/delete-confirm-light.png` });
});
