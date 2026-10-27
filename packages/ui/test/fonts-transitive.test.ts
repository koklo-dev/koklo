import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cssPath, readRequired, uiRoot } from "./helpers/paths.ts";

const FORBIDDEN = ["fonts.googleapis.com", "fonts.gstatic.com"];
const IMPORT_RE = /@import\s+(?:url\()?["']([^"']+)["']\)?/g;

/** Résout un @import : relatif au fichier courant, sinon paquet npm de packages/ui. */
function resolveImport(spec: string, from: string): string {
  return spec.startsWith(".") ? resolve(dirname(from), spec) : join(uiRoot, "node_modules", spec);
}

/** Fichiers CSS atteints transitivement depuis `entry` (inclus), imports résolus sur disque. */
function collectImportedCss(entry: string, seen = new Set<string>()): string[] {
  if (seen.has(entry)) return [];
  seen.add(entry);
  const css = readFileSync(entry, "utf8");
  for (const m of css.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? "";
    if (/^(https?:)?\/\//.test(spec)) throw new Error(`Import distant interdit : ${spec}`);
    if (spec === "tailwindcss") continue;
    const target = resolveImport(spec, entry);
    expect(existsSync(target), `import non résolu : ${spec}`).toBe(true);
    collectImportedCss(target, seen);
  }
  return [...seen];
}

describe("CA3 - CSS importé transitivement (fichiers Fontsource résolus)", () => {
  const files = collectImportedCss(join(uiRoot, "src/styles/index.css"));

  it("le parcours atteint les fichiers Fontsource installés", () => {
    const rel = files.map((f) => relative(uiRoot, f));
    expect(rel).toContain("src/styles/fonts.css");
    expect(rel.some((f) => f.includes("@fontsource/instrument-sans/400.css"))).toBe(true);
    expect(rel.some((f) => f.includes("@fontsource/jetbrains-mono/500.css"))).toBe(true);
  });

  it("aucun fichier atteint ne référence Google Fonts ni une URL distante", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const host of FORBIDDEN) expect(text, `${file} : ${host}`).not.toContain(host);
      expect(text, file).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//);
    }
  });

  it("fonts.css ne dépend que des imports Fontsource attendus", () => {
    const specs = [...readRequired(cssPath.fonts).matchAll(IMPORT_RE)].map((m) => m[1]);
    expect(specs.every((s) => s?.startsWith("@fontsource/"))).toBe(true);
  });
});
