import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { uiRoot, walk } from "./helpers/paths.ts";

/**
 * TK-85 puis TK-87 (CA1, cas 1.6) : tout `src/components/**` est parcouru par glob, sans liste de fichiers.
 * Les valeurs littérales ne sont admises que dans `src/styles/*.css`.
 */
const componentsDir = join(uiRoot, "src/components");

/** Fichiers installés par la CLI shadcn (TK-85) : leur présence reste exigée. */
const REQUIRED = ["sidebar", "tooltip", "breadcrumb", "collapsible", "field", "label"];

/** TK-87 (passation 01 §0.3, 02-design §2.3) : composants du lot 0, couverts par le même glob. */
const LOT0 = [
  "lifecycle-status",
  "validation-status",
  "deliverable-status",
  "priority-indicator",
  "entity-chip",
  "hover-card",
  "inline-alert",
  "empty-state",
  "phase-rail",
];

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black";
const FORBIDDEN: Array<[string, RegExp]> = [
  ["#hex", /(?<![\w&/])#[0-9a-fA-F]{3,8}\b/],
  ["rgb()/hsl()/oklch()", /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/],
  [
    "classe de palette Tailwind",
    new RegExp(
      `\\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|shadow|decoration|accent|caret)-(?:${PALETTE})(?:-\\d{2,3})?(?:/\\d+)?\\b`,
    ),
  ],
  ["SVG en ligne (icônes via <Icon>)", /<svg\b/],
];

/** Violations d'un source : libellés des règles enfreintes. */
function violations(code: string): string[] {
  return FORBIDDEN.filter(([, re]) => re.test(code)).map(([label]) => label);
}

const files = walk(componentsDir, []).filter((f) => /\.(tsx?|css)$/.test(f));

describe("CA1 (TK-87) : le garde de @koklo/ui parcourt src/components/** par glob", () => {
  it.each(REQUIRED)("le composant %s existe (installé par la CLI shadcn)", (name) => {
    expect(existsSync(join(componentsDir, `${name}.tsx`)), name).toBe(true);
  });

  it("le glob couvre les composants du lot 0 (aucune liste blanche à tenir à jour)", () => {
    const names = files.map((f) => relative(componentsDir, f));
    for (const name of LOT0) expect(names, name).toContain(`${name}.tsx`);
  });

  it.each(files.map((f) => relative(uiRoot, f)))(
    "%s : ni couleur en dur ni SVG en ligne",
    (rel) => {
      expect(violations(readFileSync(join(uiRoot, rel), "utf8")), rel).toEqual([]);
    },
  );
});

describe("le détecteur reconnaît chaque forme interdite", () => {
  it.each([
    ['<div className="bg-amber-100" />', "classe de palette Tailwind"],
    ['<div style={{ color: "#5b3fd9" }} />', "#hex"],
    ['const shadow = "rgb(20 16 43 / .12)";', "rgb()/hsl()/oklch()"],
    ['const c = "oklch(0.6 0.2 280)";', "rgb()/hsl()/oklch()"],
    ["<svg viewBox='0 0 1 1' />", "SVG en ligne (icônes via <Icon>)"],
  ])("%s -> %s", (code, label) => {
    expect(violations(code)).toContain(label);
  });

  it("les jetons ne sont pas des violations", () => {
    expect(
      violations('<div className="bg-surface border-border-strong shadow-floating" />'),
    ).toEqual([]);
  });
});
