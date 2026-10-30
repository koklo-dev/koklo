import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pkgDir = resolve(import.meta.dirname, "..");
const SKIP = new Set(["node_modules", "dist", "coverage", ".turbo"]);
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = resolve(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

/** Motifs assemblés en morceaux : ce fichier ne contient lui-même aucun motif complet. */
const PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["PEM", new RegExp(`-----BEGIN [A-Z ]*${"PRIVATE"} KEY-----`)],
  ["jeton gh", new RegExp(`\\b(?:gh[pousr]_|github_${"pat"}_)[A-Za-z0-9_]{20,}`)],
  [
    "client secret en dur",
    new RegExp(`client_${"secret"}["']?\\s*[:=]\\s*["'][A-Za-z0-9]{20,}["']`, "i"),
  ],
  ["Authorization en dur", /Authorization["']?\s*[:=]\s*["'](?:token|bearer) [A-Za-z0-9_]{20,}/i],
];

describe("CA10 aucun secret en dur dans packages/github", () => {
  const files = walk(pkgDir).filter(
    (f) => !f.endsWith("secrets-scan.test.ts") && !/\.(png|jpg|ico|lock)$/.test(f),
  );

  it("scanne un jeu de fichiers non vide", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(PATTERNS)("aucun motif %s", (_label, pattern) => {
    for (const file of files) expect(readFileSync(file, "utf8"), file).not.toMatch(pattern);
  });

  it("le .env.real.example, s'il existe, ne contient que des valeurs vides", () => {
    const example = resolve(pkgDir, ".env.real.example");
    if (!existsSync(example)) return;
    for (const line of readFileSync(example, "utf8").split("\n")) {
      if (line.trim() === "" || line.startsWith("#")) continue;
      expect(line, line).toMatch(/^KOKLO_GH_[A-Z_]+=$/);
    }
  });
});
