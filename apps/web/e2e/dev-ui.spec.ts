import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { AXE_TAGS, CAPTURES_DIR, settle, type Theme } from "./support/helpers.ts";

/**
 * TK-87 CA2 (cas 2.11), CA4 (cas 4.5) et CA6 (cas 6.1, 6.2) : galerie `/dev/ui` (fiche S-dev-ui).
 * Le serveur e2e tourne en APP_ENV=test : la galerie est ouverte. Le 404 de production est prouvé par
 * `test/dev-ui-page.test.tsx` (sans serveur de production).
 */
const PATH = "/dev/ui";
const DIR = `${CAPTURES_DIR}/S-dev-ui`;
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900, suffix: "" },
  { name: "mobile", width: 375, height: 812, suffix: "-mobile" },
] as const;
async function open(page: Page, theme: Theme): Promise<void> {
  const response = await page.goto(PATH);
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "Galerie des composants" }),
  ).toBeVisible();
  if (theme === "dark") {
    // La galerie a sa propre bascule (hors AppShell) ; avant l'hydratation le clic est sans effet.
    await expect(async () => {
      await page
        .getByRole("group", { name: "Thème" })
        .getByRole("button", { name: "Sombre" })
        .click();
      await expect(page.locator("html")).toHaveClass(/\bdark\b/, { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  }
}

async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const theme of ["light", "dark"] as Theme[]) {
  for (const viewport of VIEWPORTS) {
    test(`S-dev-ui ${viewport.name} (${theme}) : 200, axe sans violation, capture pleine page`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await open(page, theme);
      await settle(page);
      await expectNoViolations(page);
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `${DIR}/full-${theme}${viewport.suffix}.png`, fullPage: true });
    });
  }

  test(`S-dev-ui aperçu ouvert au focus (${theme}) : HoverCard sur F-001, axe, capture`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, theme);
    await page.getByRole("link", { name: "Fonctionnalité F-001 Connexion" }).focus();
    const summary = page.getByText("3 critères · liée à S-login");
    await expect(summary.first()).toBeVisible();
    await settle(page);
    await expectNoViolations(page);
    await page.screenshot({ path: `${DIR}/hovercard-${theme}.png`, fullPage: false });
    await page.keyboard.press("Escape");
  });

  test(`S-dev-ui « Détails » déplié (${theme}) : bloc d'envoi, axe, capture`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, theme);
    const toggle = page.getByRole("button", { name: "Détails" }).first();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Ne saisissez pas de données personnelles.").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Anthropic|États-Unis/);
    await settle(page);
    await expectNoViolations(page);
    await toggle.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${DIR}/details-open-${theme}.png`, fullPage: false });
  });
}

/** TK-94 lot B : section « Listes longues » (fiche S-dev-ui §3, captures lists-*). */
const lists = (page: Page) => page.getByRole("region", { name: "Listes longues" });

for (const theme of ["light", "dark"] as Theme[]) {
  for (const viewport of VIEWPORTS) {
    test(`S-dev-ui listes longues ${viewport.name} (${theme}) : axe sans violation, sans défilement horizontal, capture`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await open(page, theme);
      await lists(page).scrollIntoViewIfNeeded();
      await settle(page);
      const results = await new AxeBuilder({ page })
        .include("[aria-labelledby='dev-ui-lists']")
        .withTags(AXE_TAGS)
        .analyze();
      expect(results.violations).toEqual([]);
      await expectNoHorizontalScroll(page);
      await lists(page).screenshot({ path: `${DIR}/lists-${theme}${viewport.suffix}.png` });
    });
  }
}

/** TK-140 lot B : section « Listes · B » (fiche S-dev-ui, captures lists-b-*). */
const listsB = (page: Page) => page.getByRole("region", { name: "Listes · B" });

for (const theme of ["light", "dark"] as Theme[]) {
  for (const viewport of VIEWPORTS) {
    test(`S-dev-ui lists-b ${viewport.name} (${theme}) : axe sans violation, sans défilement horizontal, capture`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await open(page, theme);
      await listsB(page).scrollIntoViewIfNeeded();
      await settle(page);
      const results = await new AxeBuilder({ page })
        .include("[aria-labelledby='dev-ui-lists-b']")
        .withTags(AXE_TAGS)
        .analyze();
      expect(results.violations).toEqual([]);
      await expectNoHorizontalScroll(page);
      await listsB(page).screenshot({ path: `${DIR}/lists-b-${theme}${viewport.suffix}.png` });
    });
  }
}

test("S-dev-ui lists-b : le résumé du ProjectHeader est sous le titre à 375 px, dans la rangée dès 1280", async ({
  page,
}) => {
  const summary = () => listsB(page).getByText("4 fonctionnalités validées sur 7");
  const heading = () => listsB(page).getByRole("heading", { name: "Cahier fonctionnel" });
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page, "light");
  const small = { s: await summary().boundingBox(), h: await heading().boundingBox() };
  expect(small.s?.y ?? 0).toBeGreaterThan((small.h?.y ?? 0) + (small.h?.height ?? 0) - 1);
  await page.setViewportSize({ width: 1280, height: 800 });
  await settle(page);
  const wide = { s: await summary().boundingBox(), h: await heading().boundingBox() };
  expect(Math.abs((wide.s?.y ?? 0) - (wide.h?.y ?? 0))).toBeLessThan(20);
});

test("S-dev-ui lists-b : ligne sélectionnable atteignable au clavier", async ({ page }) => {
  await open(page, "light");
  const row = listsB(page).getByRole("button", { name: /Réserver un créneau/ });
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(row).toHaveAttribute("aria-current", "true");
});

/** TK-140 lot C : section « Navigation · C » (fiche S-dev-ui, captures nav-*). */
const nav = (page: Page) => page.getByRole("region", { name: "Navigation · C" });

for (const theme of ["light", "dark"] as Theme[]) {
  for (const viewport of VIEWPORTS) {
    test(`S-dev-ui nav ${viewport.name} (${theme}) : axe sans violation, sans défilement horizontal, capture`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await open(page, theme);
      await nav(page).scrollIntoViewIfNeeded();
      await settle(page);
      const results = await new AxeBuilder({ page })
        .include("[aria-labelledby='dev-ui-nav']")
        .withTags(AXE_TAGS)
        .analyze();
      expect(results.violations).toEqual([]);
      await expectNoHorizontalScroll(page);
      await nav(page).screenshot({ path: `${DIR}/nav-${theme}${viewport.suffix}.png` });
    });
  }
}

test("S-dev-ui nav : SecondaryNav horizontale défilante à 375 px, verticale de 240 dès 1280", async ({
  page,
}) => {
  const secondary = () => nav(page).getByRole("navigation", { name: "Sections des réglages" });
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page, "light");
  const small = await secondary().boundingBox();
  expect(small?.width ?? 0).toBeLessThanOrEqual(375);
  const first = await secondary().getByRole("link", { name: "Général" }).boundingBox();
  expect(first?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.setViewportSize({ width: 1280, height: 800 });
  await settle(page);
  const wide = await secondary().boundingBox();
  expect(Math.round(wide?.width ?? 0)).toBe(240);
});

test("S-dev-ui GroupSection à 375 px : titre, compteurs et action ne se chevauchent pas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page, "light");
  const header = lists(page).locator("[data-slot='group-section-header']").first();
  await header.scrollIntoViewIfNeeded();
  const boxes = await Promise.all(
    [
      header.locator("button[aria-expanded] > span").nth(0),
      header.locator(":scope > div > span").first(),
      header.getByRole("button", { name: "Accepter les 22 restantes" }),
    ].map((item) => item.boundingBox()),
  );
  const [title, counts, action] = boxes;
  for (const box of [title, counts, action]) {
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
  }
  const apart = (a: NonNullable<typeof title>, b: NonNullable<typeof title>) =>
    a.y + a.height <= b.y + 1 ||
    b.y + b.height <= a.y + 1 ||
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x;
  expect(apart(title!, counts!)).toBe(true);
  expect(apart(counts!, action!)).toBe(true);
  await expect(header.getByRole("button", { name: "Accepter les 22 restantes" })).toBeVisible();
});

test("S-dev-ui VirtualList : peu de lignes dans le DOM, la suite arrive en approchant du bas, l'annonce ne vole pas le focus", async ({
  page,
}) => {
  await open(page, "light");
  const list = lists(page).getByRole("list", { name: "Fonctionnalités (exemple)" });
  await list.scrollIntoViewIfNeeded();
  const rows = list.getByRole("listitem");
  expect(await rows.count()).toBeLessThanOrEqual(80);
  await expect(rows.first()).toHaveAttribute("aria-setsize", "1000");
  const status = lists(page).getByRole("status").first();
  const scroller = lists(page).locator("[data-slot='virtual-list']");
  await rows.nth(3).focus();
  // 50 lignes de 52 px = 2 600 px : à 80 % de la liste chargée (2 080 px), la sentinelle déclenche la page suivante.
  await scroller.evaluate((el) => {
    el.scrollTop = 1_900;
  });
  await expect(status).toHaveText("50 fonctionnalités de plus chargées · 100 sur 1 000", {
    timeout: 5_000,
  });
  expect(await rows.count()).toBeLessThanOrEqual(80);
  await expect(page.locator("[data-row-key]:focus")).toHaveCount(1);
});

test("S-dev-ui : les 8 composants, HoverCard, les boutons et le désactivé avec sa raison", async ({
  page,
}) => {
  await open(page, "light");
  for (const slot of [
    "lifecycle-status",
    "validation-status",
    "deliverable-status",
    "priority-indicator",
    "entity-chip",
    "inline-alert",
    "empty-state",
    "phase-rail",
  ]) {
    expect(await page.locator(`[data-slot='${slot}']`).count(), slot).toBeGreaterThan(0);
  }
  const disabled = page.getByRole("button", { name: "Désactivé" });
  await expect(disabled).toBeDisabled();
  await expect(disabled).toHaveAccessibleDescription("Toujours avec sa raison à côté");
  await expect(page.getByRole("button", { name: "Action principale" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Secondaire" }).first()).toBeEnabled();
  await expect(page.getByRole("button", { name: "Discret" }).first()).toBeEnabled();
});

test("S-dev-ui : le bouton désactivé n'a plus d'opacité réduite et porte le pointillé", async ({
  page,
}) => {
  await open(page, "light");
  const style = await page.getByRole("button", { name: "Désactivé" }).evaluate((el) => {
    const s = getComputedStyle(el);
    return { opacity: s.opacity, borderStyle: s.borderTopStyle };
  });
  expect(style.opacity).toBe("1");
  expect(style.borderStyle).toBe("dashed");
});

/** TK-138 : sections « Primitives de base » A, B, C (fiche S-dev-ui, captures primitives-*). */
const PRIMITIVES = [
  { key: "a", name: /Primitives de base · A/, id: "dev-ui-prim-a" },
  { key: "b", name: /Primitives de base · B/, id: "dev-ui-prim-b" },
  { key: "c", name: /Primitives de base · C/, id: "dev-ui-prim-c" },
] as const;

for (const theme of ["light", "dark"] as Theme[]) {
  for (const viewport of VIEWPORTS) {
    test(`S-dev-ui primitives ${viewport.name} (${theme}) : axe sans violation, sans défilement horizontal, captures`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await open(page, theme);
      await settle(page);
      for (const p of PRIMITIVES) {
        const region = page.getByRole("region", { name: p.name });
        await region.scrollIntoViewIfNeeded();
        const results = await new AxeBuilder({ page })
          .include(`[aria-labelledby='${p.id}']`)
          .withTags(AXE_TAGS)
          .analyze();
        expect(results.violations, p.id).toEqual([]);
        await expectNoHorizontalScroll(page);
        if (viewport.suffix === "") {
          await region.screenshot({ path: `${DIR}/primitives-${p.key}-${theme}.png` });
        }
      }
      const first = await page.getByRole("region", { name: PRIMITIVES[0].name }).boundingBox();
      const last = await page.getByRole("region", { name: PRIMITIVES[2].name }).boundingBox();
      if (!first || !last) throw new Error("sections Primitives introuvables");
      const scrollY = await page.evaluate(() => window.scrollY);
      await page.screenshot({
        path: `${DIR}/primitives-${theme}${viewport.suffix}.png`,
        fullPage: true,
        clip: {
          x: 0,
          y: first.y + scrollY,
          width: viewport.width,
          height: last.y + scrollY + last.height - (first.y + scrollY),
        },
      });
    });
  }
}

test("S-dev-ui groupe C : champs 40 et 36, désactivé pointillé sans opacité réduite", async ({
  page,
}) => {
  await open(page, "light");
  const measure = (name: string) =>
    page.getByRole("textbox", { name, exact: true }).evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        height: el.getBoundingClientRect().height,
        opacity: s.opacity,
        border: s.borderTopStyle,
      };
    });
  expect((await measure("Plafond mensuel")).height).toBe(40);
  expect((await measure("Plafond compact")).height).toBe(36);
  const disabled = await measure("Champ désactivé");
  expect(disabled.border).toBe("dashed");
  expect(disabled.opacity).toBe("1");
});

/** TK-139 : sections « Surfaces et retours » (fiche S-dev-ui §3, captures surfaces-*). Lots A, B et C. */
const SURFACES = [
  { key: "a", name: /Surfaces · A/, id: "dev-ui-surf-a" },
  { key: "b", name: /Superpositions · B/, id: "dev-ui-surf-b" },
  { key: "c", name: /Onglets et tableaux · C/, id: "dev-ui-surf-c" },
] as const;

for (const theme of ["light", "dark"] as Theme[]) {
  for (const viewport of VIEWPORTS) {
    test(`S-dev-ui surfaces ${viewport.name} (${theme}) : axe sans violation, sans défilement horizontal, captures`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await open(page, theme);
      await settle(page);
      for (const s of SURFACES) {
        const region = page.getByRole("region", { name: s.name });
        await region.scrollIntoViewIfNeeded();
        const results = await new AxeBuilder({ page })
          .include(`[aria-labelledby='${s.id}']`)
          .withTags(AXE_TAGS)
          .analyze();
        expect(results.violations, s.id).toEqual([]);
        await expectNoHorizontalScroll(page);
        if (viewport.suffix === "") {
          await region.screenshot({ path: `${DIR}/surfaces-${s.key}-${theme}.png` });
        }
      }
      const first = await page.getByRole("region", { name: SURFACES[0].name }).boundingBox();
      const last = await page
        .getByRole("region", { name: SURFACES[SURFACES.length - 1]?.name })
        .boundingBox();
      if (!first || !last) throw new Error("sections Surfaces introuvables");
      const scrollY = await page.evaluate(() => window.scrollY);
      await page.screenshot({
        path: `${DIR}/surfaces-${theme}${viewport.suffix}.png`,
        fullPage: true,
        clip: {
          x: 0,
          y: first.y + scrollY,
          width: viewport.width,
          height: last.y + scrollY + last.height - (first.y + scrollY),
        },
      });
    });
  }
}

test("S-dev-ui surfaces A : composants rendus, InlineAlert aux cinq tons, EmptyState inline sans tuile", async ({
  page,
}) => {
  await open(page, "light");
  const region = page.getByRole("region", { name: /Surfaces · A/ });
  for (const variant of ["panel", "inset", "interactive", "proposal", "dashed", "warning"]) {
    expect(
      await region.locator(`[data-slot='card'][data-variant='${variant}']`).count(),
      variant,
    ).toBe(variant === "interactive" ? 2 : 1);
  }
  expect(await region.locator("[data-slot='stat-card']").count()).toBe(4);
  expect(await region.locator("[data-slot='skeleton-row']").count()).toBe(4);
  for (const tone of ["neutral", "success", "agent", "warning", "error"]) {
    expect(
      await region.locator(`[data-slot='inline-alert'][data-variant='${tone}']`).count(),
      tone,
    ).toBeGreaterThan(0);
  }
  const inline = region.locator("[data-slot='empty-state'][data-variant='inline']");
  await expect(inline).toHaveCount(1);
  await expect(inline.locator("[data-slot='icon-tile']")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/Anthropic|OpenAI/);
});

/** TK-139 lot B : superpositions ouvertes par leur bouton (fiche §3 cas 13, captures overlays-*). */
const OVERLAYS = [
  { key: "dialog", trigger: "Ouvrir le dialogue", role: "dialog", name: "Nouveau projet" },
  {
    key: "alertdialog",
    trigger: "Ouvrir le dialogue d'alerte",
    role: "alertdialog",
    name: "Supprimer le projet ?",
  },
  { key: "sheet", trigger: "Tiroir 540", role: "dialog", name: "Plafond mensuel" },
] as const;

for (const theme of ["light", "dark"] as Theme[]) {
  for (const viewport of VIEWPORTS) {
    for (const overlay of OVERLAYS) {
      test(`S-dev-ui superposition ${overlay.key} ${viewport.name} (${theme}) : axe, clavier, capture`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await open(page, theme);
        await settle(page);
        const trigger = page.getByRole("button", { name: overlay.trigger, exact: true });
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        const panel = page.getByRole(overlay.role, { name: overlay.name });
        await expect(panel).toBeVisible();
        await page.waitForTimeout(400);
        const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(results.violations).toEqual([]);
        await expectNoHorizontalScroll(page);
        // Pied en ligne à toute largeur (planches 08 et 22) : les deux boutons partagent la même ligne.
        const tops = await panel
          .locator("button:visible")
          .evaluateAll((nodes) =>
            nodes
              .filter((node) => /Annuler|Créer le projet|Enregistrer/.test(node.textContent ?? ""))
              .map((node) => Math.round(node.getBoundingClientRect().top)),
          );
        if (overlay.key !== "alertdialog") expect(new Set(tops).size).toBe(1);
        await page.screenshot({
          path: `${DIR}/overlays-${overlay.key}-${theme}${viewport.suffix}.png`,
        });
        await page.keyboard.press("Escape");
        await expect(panel).toHaveCount(0);
        await expect(trigger).toBeFocused();
      });
    }

    test(`S-dev-ui superposition toast ${viewport.name} (${theme}) : axe, capture`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await open(page, theme);
      await settle(page);
      const trigger = page.getByRole("button", { name: "Toast d'erreur" });
      await trigger.scrollIntoViewIfNeeded();
      // Avant l'hydratation le clic est sans effet : on le rejoue jusqu'à l'apparition du toast.
      await expect(async () => {
        await trigger.click();
        await expect(page.getByText("L'envoi a échoué").first()).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
      await page.waitForTimeout(400);
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations).toEqual([]);
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `${DIR}/overlays-toast-${theme}${viewport.suffix}.png` });
    });
  }
}

test("S-dev-ui superpositions B : dialogue d'alerte, tiroirs 440 / 540 / 620, F8 et Échap sur un toast", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "light");
  await settle(page);
  const alertTrigger = page.getByRole("button", { name: "Ouvrir le dialogue d'alerte" });
  await alertTrigger.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Annuler" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(alertTrigger).toBeFocused();
  for (const [name, width] of [
    ["Tiroir 440", 440],
    ["Tiroir 540", 540],
    ["Tiroir 620", 620],
  ] as const) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.waitForTimeout(400);
    const box = await page.getByRole("dialog", { name: "Plafond mensuel" }).boundingBox();
    expect(Math.round(box?.width ?? 0), name).toBe(width);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Toast de succès" }).click();
  await expect(page.getByText("Projet créé")).toBeVisible();
  await page.keyboard.press("F8");
  await expect(page.locator("[aria-label='Notifications (F8)'] ol")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Projet créé")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/Anthropic|OpenAI/);
});

test("S-dev-ui surfaces C : onglets soulignés (36, trait --primary), tableau encadré défilant dans son cadre, YesNoCell nommées", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page, "light");
  await settle(page);
  const region = page.getByRole("region", { name: /Onglets et tableaux · C/ });
  await region.scrollIntoViewIfNeeded();
  const link = region.getByRole("link", { name: /Vue d'ensemble/ });
  expect((await link.boundingBox())?.height).toBe(36);
  await expect(link).toHaveAttribute("aria-current", "page");
  const tablist = region.getByRole("tablist", { name: /États des demandes/ });
  await tablist.getByRole("tab", { name: /Terminées/ }).click();
  await expect(tablist.getByRole("tab", { name: /Terminées/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const framed = region.getByRole("table", { name: "Membres de l'organisation" });
  const wrapper = framed.locator("xpath=..");
  expect(await wrapper.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await expectNoHorizontalScroll(page);
  expect(await region.getByRole("img", { name: "Oui" }).count()).toBeGreaterThan(0);
  expect(await region.getByRole("img", { name: "Non" }).count()).toBeGreaterThan(0);
});
