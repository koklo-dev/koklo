import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { cssPath, readRequired, uiRoot, walk } from "./helpers/paths.ts";

const FORBIDDEN = ["fonts.googleapis.com", "fonts.gstatic.com"];
const IGNORED_DIRS = ["node_modules", "test", "dist", "coverage", ".turbo"];

type Family = "instrument-sans" | "jetbrains-mono";
const EXPECTED_WEIGHTS: Record<Family, number[]> = {
  "instrument-sans": [400, 500, 600, 700],
  "jetbrains-mono": [400, 500],
};
const FAMILY_NAME: Record<Family, string> = {
  "instrument-sans": "Instrument Sans",
  "jetbrains-mono": "JetBrains Mono",
};

/** Graisses déclarées pour une famille : imports Fontsource et/ou @font-face. */
function declaredWeights(css: string, family: Family): number[] {
  const weights = new Set<number>();
  const importRe = new RegExp(
    `@fontsource(?:-variable)?/${family}/(?:[a-z-]+-)?(\\d{3})(?:-italic)?\\.css`,
    "g",
  );
  for (const m of css.matchAll(importRe)) weights.add(Number(m[1]));
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = m[1] ?? "";
    const name = /font-family:\s*["']?([^"';]+)["']?/.exec(body)?.[1]?.trim();
    const weight = /font-weight:\s*(\d{3})\b/.exec(body)?.[1];
    if (name === FAMILY_NAME[family] && weight) weights.add(Number(weight));
  }
  return [...weights].sort((a, b) => a - b);
}

describe("CA3 - aucune dépendance à Google Fonts", () => {
  it("aucune occurrence de fonts.googleapis.com / fonts.gstatic.com dans packages/ui", () => {
    const files = walk(uiRoot, IGNORED_DIRS);
    // garde-fou : le fichier de polices livré doit faire partie du périmètre scanné
    expect(files.map((f) => relative(uiRoot, f))).toContain("src/styles/fonts.css");
    const offenders = files.filter((f) => {
      const text = readFileSync(f, "utf8");
      return FORBIDDEN.some((host) => text.includes(host));
    });
    expect(offenders.map((f) => relative(uiRoot, f))).toEqual([]);
  });
});

describe("CA3 - polices auto-hébergées (Fontsource)", () => {
  it.each(Object.keys(EXPECTED_WEIGHTS) as Family[])("%s : graisses exactes", (family) => {
    const css = readRequired(cssPath.fonts);
    expect(declaredWeights(css, family)).toEqual(EXPECTED_WEIGHTS[family]);
  });

  it("aucune source distante (http/https) dans fonts.css", () => {
    const css = readRequired(cssPath.fonts);
    expect(css).not.toMatch(/https?:\/\//);
  });

  it("les paquets Fontsource sont déclarés comme dépendances", () => {
    const pkg = JSON.parse(readFileSync(`${uiRoot}/package.json`, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    for (const family of Object.keys(EXPECTED_WEIGHTS)) {
      expect(pkg.dependencies?.[`@fontsource/${family}`], family).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
