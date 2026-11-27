import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  AXE_TAGS,
  CAPTURES_DIR,
  type KanbanRole,
  setScenario,
  settle,
  switchToDark,
  type Theme,
} from "./support/helpers.ts";
import { FEATURE_PROJECT_ID } from "./support/stub-features.ts";
import { LONG_COMPONENT_ID } from "./support/stub-spec-architecture.ts";

/**
 * TK-114i (S-spec-architecture §19, maquette 13 l.218-238 et 405-414) : identifiants longs. La liste des flux garde son
 * titre, la fiche du composant ne pousse jamais la page ni ses boutons hors de la fenêtre. Faux API : mode « longs » de
 * support/stub-spec-architecture.ts. Captures : design/screens/captures/S-spec-architecture/long-id-*.png.
 */
const PATH = `/projects/${FEATURE_PROJECT_ID}/spec/architecture`;
const ZONE = "Comptes et authentification";
const FICHE_URL = `${PATH}?tab=schema&zone=${encodeURIComponent(ZONE)}&sel=${LONG_COMPONENT_ID}`;
const FICHE = "Fiche du composant";
const LONG_FLOW = {
  id: "P-consultation-de-la-transparence-sur-les-donnees",
  title: "Consulter la transparence sur les données",
};
const SHORT_FLOW = { id: "P-reserver", title: "Réserver" };
const VIEWS = ["Fiche", "YAML", "Mermaid"] as const;
type View = (typeof VIEWS)[number];

const start = async (page: Page, width: number, height: number, role?: KanbanRole) => {
  await page.setViewportSize({ width, height });
  await setScenario({
    session: true,
    projects: "data",
    installations: "single",
    architecture: "longs",
    proposals: "none",
    ...(role ? { role } : {}),
    ...(role === "client" ? { archState: "validated" as const } : {}),
  });
};
const open = async (page: Page, url: string, theme: Theme = "light") => {
  if (theme === "dark") {
    await page.goto(PATH);
    await switchToDark(page);
  }
  await page.goto(url);
};
const capture = async (page: Page, name: string, fullPage = true) => {
  await settle(page);
  await page.screenshot({
    path: `${CAPTURES_DIR}/S-spec-architecture/long-id-${name}.png`,
    fullPage,
  });
};
const expectAxeClean = async (page: Page) => {
  await settle(page);
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations, JSON.stringify(results.violations.map((v) => v.id))).toEqual([]);
};
const boxOf = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error("élément sans boîte");
  return box;
};
/** Débordement horizontal de la page, avec les éléments qui dépassent le bord droit de la fenêtre. */
const pageOverflow = (page: Page) =>
  page.evaluate(() => {
    const root = document.documentElement;
    // Ce qu'un cadre défilant ou rogné contient n'élargit pas la page.
    const contained = (el: Element) => {
      for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
        if (getComputedStyle(up).overflowX !== "visible") return true;
      }
      return false;
    };
    const offenders = [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5 && !contained(el))
      .slice(0, 12)
      .map((el) => {
        const { width, right } = el.getBoundingClientRect();
        const text = (el.textContent ?? "").slice(0, 40);
        return `${el.tagName.toLowerCase()}[${el.getAttribute("data-slot") ?? ""}] l=${Math.round(width)} d=${Math.round(right)} « ${text} »`;
      });
    return { extra: root.scrollWidth - root.clientWidth, offenders };
  });
const expectNoPageOverflow = async (page: Page, state: string) => {
  const { extra, offenders } = await pageOverflow(page);
  expect.soft(extra, `${state}\n${offenders.join("\n")}`).toBeLessThanOrEqual(0);
};

/** Montre la vue de la fiche et attend son contenu. */
const showView = async (fiche: Locator, view: View) => {
  if (view !== "Fiche") await fiche.getByRole("button", { name: view, exact: true }).click();
  const loaded = {
    Fiche: fiche.getByRole("region", { name: "Dépend de" }),
    YAML: fiche.getByRole("region", { name: "YAML du composant" }),
    Mermaid: fiche.getByRole("region", { name: "Mermaid du schéma" }),
  }[view];
  await expect(loaded).toBeVisible();
};
/** La source Mermaid montrée porte bien la ligne très longue exigée par A6 (300 caractères au moins). */
const expectLongMermaidLine = async (fiche: Locator) => {
  const text = await fiche.getByRole("region", { name: "Mermaid du schéma" }).textContent();
  const longest = Math.max(...(text ?? "").split("\n").map((line) => line.length));
  expect(longest, "ligne Mermaid la plus longue").toBeGreaterThanOrEqual(300);
};
/** « Modifier » et le sélecteur Fiche · YAML · Mermaid restent dans la fenêtre et dans la fiche. */
const expectButtonsInside = async (fiche: Locator, width: number, state: string) => {
  const frame = await boxOf(fiche);
  for (const name of ["Modifier", ...VIEWS]) {
    const box = await boxOf(fiche.getByRole("button", { name, exact: true }));
    const right = box.x + box.width;
    expect.soft(right, `${state} : « ${name} » hors fenêtre`).toBeLessThanOrEqual(width);
    expect
      .soft(right, `${state} : « ${name} » hors fiche`)
      .toBeLessThanOrEqual(frame.x + frame.width + 0.5);
    expect.soft(box.x, `${state} : « ${name} » hors fiche`).toBeGreaterThanOrEqual(frame.x - 0.5);
  }
};

test.describe("fiche du composant : identifiant long (A6)", () => {
  for (const width of [1280, 1366, 1440]) {
    test(`ancrée à ${width} px : aucune barre horizontale, boutons dans la fiche`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await start(page, width, 896);
      await open(page, FICHE_URL);
      const fiche = page.getByRole("complementary", { name: FICHE });
      await expect(
        page.getByRole("region", { name: /^Schéma d'architecture, zone/ }),
      ).toBeVisible();
      for (const view of VIEWS) {
        await showView(fiche, view);
        await settle(page);
        await expectNoPageOverflow(page, `${width} px, vue ${view}`);
        await expectButtonsInside(fiche, width, `${width} px, vue ${view}`);
        if (width === 1366 && view === "Fiche") await capture(page, "schema-light");
        if (width === 1280 && view === "Mermaid") await capture(page, "mermaid-light");
      }
      // La dernière vue montrée est Mermaid.
      await expectLongMermaidLine(fiche);
      await expectAxeClean(page);
    });
  }

  test("ancrée à 1366 px en sombre : aucune barre horizontale, axe sans violation", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await start(page, 1366, 896);
    await open(page, FICHE_URL, "dark");
    const fiche = page.getByRole("complementary", { name: FICHE });
    await showView(fiche, "Fiche");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expectNoPageOverflow(page, "1366 px sombre");
    await capture(page, "schema-dark");
    await expectAxeClean(page);
  });
});

test.describe("fiche du composant en panneau superposé (A7)", () => {
  for (const [width, height] of [
    [375, 800],
    [1024, 800],
  ] as const) {
    test(`à ${width} px : le panneau ne défile pas en largeur`, async ({ page }) => {
      test.setTimeout(90_000);
      await start(page, width, height);
      await open(page, FICHE_URL);
      const dialog = page.getByRole("dialog", { name: FICHE });
      for (const view of VIEWS) {
        await showView(dialog, view);
        await settle(page);
        const extra = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth);
        expect.soft(extra, `${width} px, vue ${view}`).toBeLessThanOrEqual(0);
        await expectAxeClean(page);
        if (width === 375 && view === "Fiche") await capture(page, "fiche-light-mobile", false);
      }
    });
  }
});

/** La ligne d'un flux : identifiant, titre et élément de liste. */
const rowOf = (list: Locator, flow: { id: string; title: string }) => ({
  id: list.getByText(flow.id, { exact: true }),
  title: list.getByText(flow.title, { exact: true }),
  item: list.getByRole("listitem").filter({ hasText: flow.id }),
});
const expectFlowRows = async (page: Page) => {
  const list = page.getByRole("region", { name: "Flux de l'architecture" });
  const long = rowOf(list, LONG_FLOW);
  await expect(long.title).toBeVisible();
  const [longId, longTitle] = [await boxOf(long.id), await boxOf(long.title)];
  expect.soft(longTitle.width, "titre du flux long écrasé").toBeGreaterThanOrEqual(112);
  expect
    .soft(longTitle.y, "titre du flux long sous l'identifiant")
    .toBeGreaterThanOrEqual(longId.y + longId.height - 0.5);
  const short = rowOf(list, SHORT_FLOW);
  const [shortId, shortTitle] = [await boxOf(short.id), await boxOf(short.title)];
  expect
    .soft(shortTitle.x, "titre court à droite de l'identifiant")
    .toBeGreaterThanOrEqual(shortId.x + shortId.width);
  expect
    .soft(shortTitle.y, "titre court sur la même ligne")
    .toBeLessThan(shortId.y + shortId.height);
  const { height } = await boxOf(short.item);
  expect.soft(Math.abs(height - 52), `ligne courte de ${height} px`).toBeLessThanOrEqual(1);
};

test.describe("liste des flux : identifiant long (A5)", () => {
  for (const role of ["owner", "client"] as const) {
    for (const [width, height, suffix] of [
      [1366, 896, ""],
      [375, 800, "-mobile"],
    ] as const) {
      test(`${role} à ${width} px : titre lisible sous l'identifiant long`, async ({ page }) => {
        test.setTimeout(90_000);
        await start(page, width, height, role);
        await open(page, `${PATH}?tab=flows`);
        await expectFlowRows(page);
        if (width >= 768) {
          await expect(page.getByRole("img", { name: /^Diagramme de séquence/ })).toBeVisible();
        }
        await settle(page);
        await expectNoPageOverflow(page, `flux ${role} ${width} px`);
        if (role === "owner") await capture(page, `flows-light${suffix}`);
        await expectAxeClean(page);
        if (width < 768) {
          await page.goto(`${PATH}?tab=flows&f=${LONG_FLOW.id}`);
          await expect(
            page.getByRole("heading", { level: 2, name: LONG_FLOW.title }),
          ).toBeVisible();
          await settle(page);
          await expectNoPageOverflow(page, `détail du flux ${role} ${width} px`);
          await expectAxeClean(page);
        }
      });
    }
  }
});
