import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { compileIndexCss } from "./helpers/compile-css.ts";
import { readRequired, stylesDir, uiRoot } from "./helpers/paths.ts";

/**
 * TK-87 (passation 01 §0.1, §0.2 ; DESIGN.md v2 §2.1, §2.2, §3, §4) : les jetons v2 sont exposés à Tailwind,
 * les éléments flottants portent l'ombre du jeton, les icônes du lot 0 sont générées.
 */

/** Utilitaires de l'échelle v2 (02-design §2.2) : nom -> propriétés que la règle compilée doit porter. */
const TYPE_UTILITIES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["text-page-title", ["font-size", "font-weight", "letter-spacing"]],
  ["text-section-title", ["font-size", "font-weight"]],
  ["text-subsection-title", ["font-size", "font-weight"]],
  ["text-body", ["font-size"]],
  ["text-meta", ["font-size"]],
  ["text-group-label", ["font-size", "font-weight", "letter-spacing"]],
  ["text-caption", ["font-size", "font-weight"]],
  ["text-code", ["font-size", "font-weight"]],
];

const COLOR_UTILITIES = [
  "bg-surface",
  "bg-raised",
  "border-border-strong",
  "bg-diff-bg",
  "shadow-floating",
] as const;

/** Corps de la règle `.utilitaire { … }` dans le CSS compilé ; vide si elle n'existe pas. */
function ruleOf(css: string, utility: string): string {
  const escaped = utility.replace(/[-/]/g, (c) => `\\${c}`);
  return new RegExp(`\\.${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
}

describe("CA5 (TK-87) - utilitaires typographiques de l'échelle v2", () => {
  let css = "";
  beforeAll(async () => {
    css = await compileIndexCss(TYPE_UTILITIES.map(([u]) => u));
  });

  it.each(TYPE_UTILITIES)("%s est généré et porte %j", (utility, props) => {
    const rule = ruleOf(css, utility);
    expect(rule, `.${utility} absent du CSS compilé`).not.toBe("");
    for (const prop of props) expect(rule, `${utility} : ${prop}`).toContain(`${prop}:`);
  });

  it("text-meta ne remplace pas la couleur text-secondary (collision évitée)", async () => {
    const out = await compileIndexCss(["text-secondary"]);
    expect(ruleOf(out, "text-secondary")).toContain("color:");
    expect(ruleOf(out, "text-secondary")).not.toContain("font-size:");
  });
});

describe("CA1 (TK-87) - jetons de couleur v2 exposés à Tailwind", () => {
  let css = "";
  beforeAll(async () => {
    css = await compileIndexCss([...COLOR_UTILITIES]);
  });

  it.each(COLOR_UTILITIES)("%s est généré", (utility) => {
    expect(ruleOf(css, utility), `.${utility} absent`).not.toBe("");
  });

  it("index.css expose --color-surface, --color-raised, --color-border-strong, --color-diff-bg et les alertes", () => {
    const index = readRequired(join(stylesDir, "index.css"));
    for (const name of [
      "--color-surface",
      "--color-raised",
      "--color-border-strong",
      "--color-diff-bg",
      "--color-alert-neutral",
      "--color-alert-warning",
      "--color-alert-error",
      "--shadow-floating",
    ]) {
      expect(index, name).toContain(name);
    }
  });
});

/** Éléments flottants (DESIGN.md v2 §2.1) : `--raised` (via `bg-popover` ou `bg-raised`) et `shadow-floating`. */
const FLOATING = ["popover", "dropdown-menu", "select", "sheet", "tooltip"] as const;

describe("CA1 (TK-87) - éléments flottants sur le jeton d'ombre", () => {
  it.each(FLOATING)("%s : shadow-floating, jamais shadow-md ni rgb(", (name) => {
    const src = readFileSync(join(uiRoot, "src/components", `${name}.tsx`), "utf8");
    expect(src).not.toMatch(/\bshadow-md\b/);
    expect(src).not.toMatch(/\brgba?\(/);
    expect(src).toMatch(/\bshadow-floating\b/);
  });

  it.each(FLOATING)("%s : surface élevée (bg-popover ou bg-raised)", (name) => {
    const src = readFileSync(join(uiRoot, "src/components", `${name}.tsx`), "utf8");
    expect(src).toMatch(/\bbg-(?:popover|raised)\b/);
  });
});

/** DESIGN.md v2 §4 : icônes à ajouter au registre du générateur au lot 0. */
const LOT0_ICONS = [
  "remove",
  "edit",
  "view_kanban",
  "gavel",
  "table",
  "error",
  "flag",
  "sync",
  "lightbulb",
] as const;

describe("CA2 (TK-87) - icônes du lot 0 générées", () => {
  it.each(LOT0_ICONS)("%s est généré dans src/icons/generated", (name) => {
    expect(existsSync(join(uiRoot, "src/icons/generated", `${name}.ts`)), name).toBe(true);
  });

  it("le registre du générateur les déclare", () => {
    const script = readFileSync(join(uiRoot, "scripts/generate-icons.ts"), "utf8");
    for (const name of LOT0_ICONS) expect(script, name).toContain(`"${name}"`);
  });
});
