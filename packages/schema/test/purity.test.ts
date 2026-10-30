import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const srcDir = resolve(root, "src");

function sources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sources(join(dir, e.name))
      : e.name.endsWith(".ts")
        ? [join(dir, e.name)]
        : [],
  );
}
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const FORBIDDEN: [string, RegExp][] = [
  ["import node:*", /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']node:/],
  [
    "import d'un module Node nu (fs, path, crypto…)",
    /(?:from\s+|require\s*\(\s*)["'](?:fs|path|crypto|child_process|os|http|https|net|url|util|stream)(?:\/[\w/]+)?["']/,
  ],
  ["fetch", /\bfetch\b/],
  ["process", /\bprocess\b/],
  ["Date", /\bDate\b/],
  ["Math.random", /\bMath\s*\.\s*random\b/],
  ["performance", /\bperformance\b/],
  ["crypto.random*", /\bcrypto\b/],
  ["console", /\bconsole\b/],
];

describe("CA9 pureté de src/", () => {
  it("src/index.ts existe et src/ contient du code", () => {
    expect(existsSync(resolve(srcDir, "index.ts"))).toBe(true);
    expect(sources(srcDir).length).toBeGreaterThanOrEqual(5);
  });

  it.each(FORBIDDEN)("aucun usage de %s dans src/", (_name, pattern) => {
    const files = sources(srcDir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(stripComments(readFileSync(file, "utf8")), file).not.toMatch(pattern);
    }
  });
});

describe("CA11 paquet", () => {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

  it("ne dépend à l'exécution que de zod et yaml, versions exactes", () => {
    expect(pkg.name).toBe("@koklo/schema");
    expect(pkg.dependencies).toEqual({ yaml: "2.9.1", zod: "4.6.7" });
  });

  it("@koklo/config est une dépendance de développement, aucune autre dépendance interne", () => {
    expect(pkg.devDependencies["@koklo/config"]).toBe("workspace:*");
    const all = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    expect(
      Object.keys(all)
        .filter((n) => n.startsWith("@koklo/"))
        .sort(),
    ).toEqual(["@koklo/config"]);
  });

  it("toutes les versions sont épinglées (aucun ^ ni ~)", () => {
    for (const version of Object.values({
      ...pkg.dependencies,
      ...pkg.devDependencies,
    }) as string[]) {
      expect(version).not.toMatch(/^[\^~]/);
    }
  });

  it("le tag turbo est schema", () => {
    const turbo = JSON.parse(readFileSync(resolve(root, "turbo.json"), "utf8"));
    expect(turbo.tags).toEqual(["schema"]);
  });

  it("les scripts lint/typecheck/test/build/schemas:generate existent", () => {
    for (const s of ["lint", "typecheck", "test", "build", "schemas:generate"])
      expect(pkg.scripts).toHaveProperty(s);
  });

  it("src/ n'importe aucun autre paquet @koklo", () => {
    for (const file of sources(srcDir))
      expect(readFileSync(file, "utf8"), file).not.toMatch(/@koklo\//);
  });
});
