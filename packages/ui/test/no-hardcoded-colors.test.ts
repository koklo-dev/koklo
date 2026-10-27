import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot, uiRoot } from "./helpers/paths.ts";

/** Fichiers ajoutés par TK-85 (blocs sidebar-07 / login-05) : tokens uniquement. */
const REQUIRED = ["sidebar.tsx", "tooltip.tsx"].map((f) => join(uiRoot, "src/components", f));
const OPTIONAL = ["separator", "input", "label", "skeleton", "field"].map((f) =>
  join(uiRoot, "src/components", `${f}.tsx`),
);
const WEB = ["app-shell", "login-card"].map((f) =>
  join(repoRoot, "apps/web/src/components", `${f}.tsx`),
);

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
];

describe("T2.3 : aucune couleur en dur dans les fichiers ajoutés", () => {
  it.each(REQUIRED)("le composant %s existe (installé par la CLI shadcn)", (file) => {
    expect(existsSync(file), file).toBe(true);
  });

  const files = [...REQUIRED, ...OPTIONAL.filter(existsSync), ...WEB];
  it.each(files)("%s", (file) => {
    const src = existsSync(file) ? readFileSync(file, "utf8") : "";
    expect(src.length, `${file} absent`).toBeGreaterThan(0);
    for (const [label, re] of FORBIDDEN) expect(src, `${label} dans ${file}`).not.toMatch(re);
  });

  it("aucun composant ajouté n'embarque de SVG en ligne (icônes via <Icon>)", () => {
    for (const file of REQUIRED) {
      expect(existsSync(file) ? readFileSync(file, "utf8") : "<svg", file).not.toContain("<svg");
    }
  });
});
