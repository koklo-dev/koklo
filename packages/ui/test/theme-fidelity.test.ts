import { describe, expect, it } from "vitest";
import { designTokens, effectiveTheme, loadBlocks, norm } from "./helpers/css.ts";
import { cssPath } from "./helpers/paths.ts";

/** Variables autorisées en plus de DESIGN.md §2.1 dans theme.css + tentative.css (Q2 de l'analyse). */
const ALLOWED_EXTENSIONS = ["--destructive-foreground"];

describe("CA1 - source de vérité DESIGN.md §2.1", () => {
  it("expose 19 variables en clair (dont --radius) et 18 en sombre", () => {
    const design = designTokens();
    expect(Object.keys(design[":root"] ?? {})).toHaveLength(19);
    expect(Object.keys(design[".dark"] ?? {})).toHaveLength(18);
    expect(design[":root"]?.["--radius"]).toBe("0.5rem");
    expect(design[".dark"]?.["--radius"]).toBeUndefined();
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
