import { describe, expect, it } from "vitest";
import { assertContrast, contrastRatio, WCAG_AA_TEXT } from "./helpers/contrast.ts";
import { effectiveTheme, loadBlocks, type StatusKey } from "./helpers/css.ts";
import { cssPath } from "./helpers/paths.ts";

/** Paires texte / fond de DESIGN.md §2.1 (analyse CA2), à valider en clair et en sombre. */
const THEME_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["--foreground", "--background"],
  ["--foreground", "--muted"],
  ["--card-foreground", "--card"],
  ["--popover-foreground", "--popover"],
  ["--primary-foreground", "--primary"],
  ["--secondary-foreground", "--secondary"],
  ["--accent-foreground", "--accent"],
  ["--muted-foreground", "--background"],
  ["--muted-foreground", "--muted"],
  ["--muted-foreground", "--card"],
  ["--muted-foreground", "--secondary"],
  ["--primary", "--background"],
  ["--primary", "--card"],
  ["--destructive", "--background"],
  ["--destructive", "--card"],
  ["--destructive-foreground", "--destructive"],
];

const STATUSES: readonly StatusKey[] = ["validated", "pending", "revise"];

describe.each([":root", ".dark"] as const)("CA2 - contraste WCAG AA du thème %s", (selector) => {
  it.each(THEME_PAIRS)("%s sur %s >= 4,5:1", (fg, bg) => {
    const theme = effectiveTheme(selector);
    expect(theme[fg], `${selector} ${fg}`).toBeDefined();
    expect(theme[bg], `${selector} ${bg}`).toBeDefined();
    expect(
      assertContrast(`${selector} ${fg}/${bg}`, theme[fg] as string, theme[bg] as string),
    ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it.each(STATUSES)("statut %s : texte sur fond >= 4,5:1", (status) => {
    const vars = loadBlocks(cssPath.status)[selector] ?? {};
    const fg = vars[`--status-${status}-fg`];
    const bg = vars[`--status-${status}-bg`];
    expect(fg, `${selector} --status-${status}-fg`).toBeDefined();
    expect(bg, `${selector} --status-${status}-bg`).toBeDefined();
    expect(
      assertContrast(`${selector} statut ${status}`, fg as string, bg as string),
    ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });
});

describe("CA2 - le calcul de contraste échoue sous le seuil", () => {
  it("calcule les valeurs de référence WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("une paire à ~4,4:1 (#787878 sur blanc) fait échouer la vérification", () => {
    const ratio = contrastRatio("#787878", "#ffffff");
    expect(ratio).toBeGreaterThan(4.35);
    expect(ratio).toBeLessThan(4.45);
    expect(() => assertContrast("paire factice", "#787878", "#ffffff")).toThrow(/< 4\.5:1/);
  });

  it("une paire à ~4,5:1 ou plus passe (#767676 sur blanc)", () => {
    expect(assertContrast("paire limite", "#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});
