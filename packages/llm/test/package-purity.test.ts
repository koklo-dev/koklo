import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pkgDir = resolve(import.meta.dirname, "..");
const repoRoot = resolve(pkgDir, "../..");
interface Manifest {
  name: string;
  private: boolean;
  type: string;
  exports: Record<string, unknown>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies?: Record<string, string>;
  tags?: string[];
  scripts: Record<string, string>;
}
const json = <T = Manifest>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

const filesUnder = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((name) => {
        const path = resolve(dir, name);
        return statSync(path).isDirectory() ? filesUnder(path) : [path];
      })
    : [];
const productionSources = filesUnder(resolve(pkgDir, "src")).filter(
  (f) => f.endsWith(".ts") && !f.includes("/src/testing/"),
);
const allSources = filesUnder(resolve(pkgDir, "src")).filter((f) => f.endsWith(".ts"));
const importsOf = (source: string): string[] =>
  [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1] as string);

describe("identité et dépendances de @koklo/llm", () => {
  const pkg = json(resolve(pkgDir, "package.json"));

  it("est privé, ESM et expose . et ./testing", () => {
    expect(pkg).toMatchObject({ name: "@koklo/llm", private: true, type: "module" });
    expect(Object.keys(pkg.exports).sort()).toEqual([".", "./testing"]);
  });

  it("dépend du seul @koklo/domain : aucune dépendance tierce (fetch direct, pas de SDK)", () => {
    expect(Object.keys(pkg.dependencies)).toEqual(["@koklo/domain"]);
    expect(pkg.dependencies["@koklo/domain"]).toBe("workspace:*");
    expect(pkg.peerDependencies).toBeUndefined();
  });

  it("aucun SDK Anthropic n'est déclaré dans le dépôt", () => {
    for (const dir of ["apps", "packages"].flatMap((g) =>
      readdirSync(resolve(repoRoot, g)).map((n) => resolve(repoRoot, g, n)),
    )) {
      const manifest = resolve(dir, "package.json");
      if (existsSync(manifest)) {
        expect(readFileSync(manifest, "utf8"), dir).not.toContain("@anthropic-ai/");
      }
    }
  });

  it("les devDependencies sont l'outillage commun du monorepo, sans paquet de runtime", () => {
    expect(Object.keys(pkg.devDependencies).sort()).toEqual([
      "@biomejs/biome",
      "@koklo/config",
      "@types/node",
      "@vitest/coverage-v8",
      "typescript",
      "vitest",
    ]);
  });

  it("expose les scripts lint, typecheck, test et build", () => {
    expect(Object.keys(pkg.scripts).sort()).toEqual(["build", "lint", "test", "typecheck"]);
  });

  it("porte le tag turbo llm, qui n'autorise que domain et config", () => {
    expect(json(resolve(pkgDir, "turbo.json")).tags).toEqual(["llm"]);
    const rules = json<{
      boundaries: { tags: Record<string, { dependencies: { allow: string[] } }> };
    }>(resolve(repoRoot, "turbo.json")).boundaries.tags;
    expect([...(rules.llm?.dependencies.allow ?? [])].sort()).toEqual(["config", "domain"]);
  });

  it("seuils de couverture : branches 90, lignes 80", () => {
    const config = readFileSync(resolve(pkgDir, "vitest.config.ts"), "utf8");
    expect(config).toMatch(/lines:\s*80/);
    expect(config).toMatch(/branches:\s*90/);
  });
});

describe("pureté des sources de production", () => {
  it("scanne bien des fichiers (garde contre une garde vide)", () => {
    expect(productionSources.length).toBeGreaterThanOrEqual(4);
  });

  it("n'importe que le domaine et des fichiers relatifs", () => {
    for (const file of productionSources) {
      for (const specifier of importsOf(readFileSync(file, "utf8"))) {
        expect(specifier, file).toMatch(/^(\.\.?\/|@koklo\/domain$)/);
      }
    }
  });

  it("l'outillage de test n'importe que le domaine, des relatifs et node:", () => {
    for (const file of allSources.filter((f) => f.includes("/src/testing/"))) {
      for (const specifier of importsOf(readFileSync(file, "utf8"))) {
        expect(specifier, file).toMatch(/^(\.\.?\/|@koklo\/domain(\/testing)?$|node:[a-z/]+)/);
      }
    }
  });

  it("ne lit ni l'environnement, ni le système de fichiers, ni la console", () => {
    for (const file of productionSources) {
      const code = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join("\n");
      for (const pattern of [
        /process\.env/,
        /\bconsole\./,
        /\brequire\s*\(/,
        /node:/,
        /\bimport\s*\(/,
      ]) {
        expect(code, `${file} contient ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("une seule URL en dur : celle de constants.ts", () => {
    const withUrl = productionSources.filter((f) =>
      /https?:\/\//.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")),
    );
    expect(withUrl.map((f) => f.replace(`${pkgDir}/`, ""))).toEqual(["src/anthropic/constants.ts"]);
  });

  it("aucun fichier de plus de 300 lignes", () => {
    for (const file of filesUnder(resolve(pkgDir, "src")).concat(
      filesUnder(resolve(pkgDir, "test")),
    )) {
      expect(readFileSync(file, "utf8").split("\n").length, file).toBeLessThanOrEqual(300);
    }
  });

  it("aucune dérogation à la limite de 50 lignes par fonction dans src (config Biome partagée)", () => {
    const biome = readFileSync(resolve(pkgDir, "biome.json"), "utf8");
    expect(biome).toContain('"extends": "//"');
    const overridden = json<{ overrides?: { includes: string[] }[] }>(
      resolve(pkgDir, "biome.json"),
    );
    for (const override of overridden.overrides ?? []) {
      expect(override.includes.every((glob) => glob.startsWith("test/"))).toBe(true);
    }
  });
});
