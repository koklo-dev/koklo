import { describe, expect, it } from "vitest";
import { designTokens, effectiveTheme, loadBlocks, norm } from "./helpers/css.ts";
import { cssPath } from "./helpers/paths.ts";

/** Variables autorisées en plus de DESIGN.md §2.1 dans theme.css + tentative.css (Q2 de l'analyse). */
const ALLOWED_EXTENSIONS = [
  "--destructive-foreground",
  // TK-138 correction 1 : rond d interrupteur blanc dans les deux thèmes (maquette 24:252).
  "--switch-thumb",
  // TK-138 (DESIGN.md §5.5) : voile et ombres des surfaces superposées.
  "--radius-card",
  "--radius-dialog",
  "--overlay",
  "--shadow-dialog",
  "--shadow-sheet",
  "--shadow-toast",
  // TK-85 : alias de la barre latérale shadcn, chacun pointe vers un token existant (02-design.md §2).
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--sidebar-ring",
];

describe("CA1 - source de vérité DESIGN.md §2.1", () => {
  it("expose 24 variables en clair (dont --radius) et 23 en sombre (v2, TK-87)", () => {
    const design = designTokens();
    expect(Object.keys(design[":root"] ?? {})).toHaveLength(24);
    expect(Object.keys(design[".dark"] ?? {})).toHaveLength(23);
    expect(design[":root"]?.["--radius"]).toBe("0.5rem");
    expect(design[".dark"]?.["--radius"]).toBeUndefined();
  });
});

/** TK-87, passation 01 §0.1 et 02 §6.4 : jetons v2 attendus mot pour mot (clair, sombre). */
const V2_TOKENS: ReadonlyArray<readonly [string, string, string]> = [
  ["--surface", "#f7f5ff", "#15122b"],
  ["--raised", "#ffffff", "#1d1838"],
  ["--border-strong", "#cfc7ee", "#3d3670"],
  ["--diff-bg", "#faf8ff", "#1a1536"],
  ["--popover", "#ffffff", "#1d1838"],
  ["--muted", "#f7f5ff", "#15122b"],
  ["--shadow-floating", "0 8px 24px rgb(20 16 43 / .12)", "none"],
];

describe("CA1 (TK-87) - jetons v2 de surface, bordure forte, diff et ombre", () => {
  it.each(V2_TOKENS)("%s : %s en clair, %s en sombre dans theme.css", (name, light, dark) => {
    expect(norm(effectiveTheme(":root")[name]), `:root ${name}`).toBe(norm(light));
    expect(norm(effectiveTheme(".dark")[name]), `.dark ${name}`).toBe(norm(dark));
  });

  it("--popover prend la valeur de --raised et --muted celle de --surface (alias H1)", () => {
    for (const selector of [":root", ".dark"] as const) {
      const theme = effectiveTheme(selector);
      expect(theme["--raised"], `${selector} --raised`).toBeDefined();
      expect(norm(theme["--popover"])).toBe(norm(theme["--raised"]));
      expect(norm(theme["--muted"])).toBe(norm(theme["--surface"]));
    }
  });
});

describe.each([":root", ".dark"] as const)("CA1 - fidélité du thème %s", (selector) => {
  it("chaque variable de DESIGN.md existe avec exactement la même valeur", () => {
    const expected = designTokens()[selector] ?? {};
    const actual = effectiveTheme(selector);
    for (const [name, value] of Object.entries(expected)) {
      expect(actual[name], `${selector} ${name}`).toBeDefined();
      expect(norm(actual[name]), `${selector} ${name}`).toBe(norm(value));
    }
  });

  it("aucune variable en trop hors extensions déclarées", () => {
    const expected = designTokens()[selector] ?? {};
    const extra = Object.keys(effectiveTheme(selector)).filter(
      (name) => !(name in expected) && !ALLOWED_EXTENSIONS.includes(name),
    );
    expect(extra).toEqual([]);
  });
});

describe("CA1 - structure des fichiers de thème", () => {
  it("theme.css déclare les blocs :root et .dark", () => {
    const blocks = loadBlocks(cssPath.theme);
    expect(Object.keys(blocks)).toEqual(expect.arrayContaining([":root", ".dark"]));
  });

  it("le sombre n'a pas de --radius propre (hérité de :root)", () => {
    expect(effectiveTheme(".dark")["--radius"]).toBeUndefined();
    expect(norm(effectiveTheme(":root")["--radius"])).toBe("0.5rem");
  });
});
