import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TK-24 C5 puis TK-87 (CA1, cas 1.5) : uniquement composants et jetons de @koklo/ui (DESIGN.md) dans
 * **tout** `apps/web/src`, parcouru par glob, sans liste blanche. Un fichier ajouté est couvert d'office.
 */
const src = join(import.meta.dirname, "../src");

const FILES = readdirSync(src, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(ts|tsx|css)$/.test(entry.name))
  .map((entry) => relative(src, join(entry.parentPath, entry.name)))
  .sort();

const PALETTE =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|white|black";
const RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ["couleur hexadécimale", /(?<![\w&/])#[0-9a-fA-F]{3,8}\b/],
  ["fonction de couleur", /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/],
  [
    "classe de palette Tailwind",
    new RegExp(
      `\\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|decoration|shadow|accent|caret)-(?:${PALETTE})(?:-\\d{2,3})?(?:/\\d+)?\\b`,
    ),
  ],
  ["SVG en ligne", /<svg\b/],
];

/** Règles enfreintes par un source (libellés). */
function colorViolations(code: string): string[] {
  return RULES.filter(([, re]) => re.test(code)).map(([label]) => label);
}

describe("le garde parcourt tout apps/web/src par glob", () => {
  it("trouve les sources de chaque dossier (app, components, lib, proxy.ts, globals.css)", () => {
    expect(FILES.length).toBeGreaterThan(150);
    for (const expected of [
      "proxy.ts",
      "app/globals.css",
      "app/layout.tsx",
      "components/ai-send-policy.tsx",
      "lib/feature-labels.ts",
    ]) {
      expect(FILES, expected).toContain(expected);
    }
  });

  it("couvre la galerie /dev/ui sans qu'on ait à la déclarer (TK-87)", () => {
    expect(FILES.some((f) => f.startsWith("app/dev/ui/"))).toBe(true);
  });
});

describe.each(FILES)("%s", (file) => {
  it("n'embarque ni couleur en dur ni classe de couleur Tailwind brute ni SVG en ligne", () => {
    expect(colorViolations(readFileSync(join(src, file), "utf8")), file).toEqual([]);
  });
});

describe("le détecteur reconnaît chaque forme interdite (preuve sans liste blanche)", () => {
  it.each([
    ['<p className="bg-amber-100 text-amber-900">', "classe de palette Tailwind"],
    ['<p className="border-slate-200/50">', "classe de palette Tailwind"],
    ['const c = "#abc";', "couleur hexadécimale"],
    ['style={{ color: "#5b3fd9" }}', "couleur hexadécimale"],
    ['const shadow = "0 1px 2px rgb(0 0 0 / .1)";', "fonction de couleur"],
    ['const c = "oklch(0.62 0.2 280)";', "fonction de couleur"],
    ["<svg viewBox='0 0 1 1' />", "SVG en ligne"],
  ])("%s -> %s", (code, label) => {
    expect(colorViolations(code)).toContain(label);
  });

  it("les jetons et les ancres ne sont pas des violations", () => {
    expect(
      colorViolations(
        '<a href="#F-001" className="bg-surface text-muted-foreground border-border-strong shadow-floating" />',
      ),
    ).toEqual([]);
  });
});
