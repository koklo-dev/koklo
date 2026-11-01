import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as rules from "../src/index.ts";
import rulesVitestConfig, { rulesCoverageThresholds } from "../vitest.config.ts";

const root = resolve(import.meta.dirname, "..");
const srcDir = resolve(root, "src");
const sources = () =>
  readdirSync(srcDir)
    .filter((f) => f.endsWith(".ts"))
    .map((file) => ({ file, text: readFileSync(resolve(srcDir, file), "utf8") }));
const importsOf = (source: string) =>
  [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1] as string);

const OPENER = /(=>\s*\{|\bfunction\b[^{]*\{|^\s*\w+\s*\([^)]*\)\s*(?::[^{]+)?\{)\s*$/;
const braceDelta = (line: string): number =>
  [...line].reduce((sum, ch) => sum + (ch === "{" ? 1 : ch === "}" ? -1 : 0), 0);
const bodyLength = (lines: string[], start: number): number => {
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    depth += braceDelta(lines[i] as string);
    if (depth <= 0) return i - start + 1;
  }
  return lines.length - start;
};
const functionLengths = (text: string): number[] => {
  const lines = text.split("\n");
  return lines.flatMap((line, start) => (OPENER.test(line) ? [bodyLength(lines, start)] : []));
};

describe("pureté de packages/rules", () => {
  it("n'importe que du relatif ou zod (ni node:*, fs, Prisma, Nest, Octokit, @koklo/*)", () => {
    expect(sources().length).toBeGreaterThan(0);
    for (const { file, text } of sources()) {
      for (const spec of importsOf(text)) {
        expect(spec.startsWith("./") || spec === "zod", `${file} importe « ${spec} »`).toBe(true);
      }
    }
  });
  it("n'utilise ni horloge, ni aléa, ni I/O, ni process", () => {
    const forbidden =
      /\b(Date\.now|new Date\(\)|Math\.random|performance\.now|crypto\.|process\.|console\.|fetch\(|setTimeout|setInterval|require\()/;
    for (const { file, text } of sources()) {
      expect(forbidden.test(text), `${file} contient un effet de bord`).toBe(false);
    }
  });
  it("fichiers source <= 300 lignes, fonctions <= 50 lignes", () => {
    for (const { file, text } of sources()) {
      expect(text.split("\n").length, `${file} dépasse 300 lignes`).toBeLessThanOrEqual(300);
      for (const length of functionLengths(text)) {
        expect(length, `${file} : fonction de ${length} lignes`).toBeLessThanOrEqual(50);
      }
    }
  });
  it("un export principal par fichier : pas de fichier utils/helpers", () => {
    for (const { file } of sources()) expect(file).not.toMatch(/^(utils?|helpers?|common)\./);
  });
});

describe("package.json et étiquette", () => {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const zodVersions = ["packages/schema", "packages/contract", "apps/api", "apps/web"].map(
    (dir) =>
      JSON.parse(readFileSync(resolve(root, "../..", dir, "package.json"), "utf8")).dependencies
        .zod as string,
  );
  it("nom @koklo/rules, module ESM, exports sur dist", () => {
    expect(pkg.name).toBe("@koklo/rules");
    expect(pkg.type).toBe("module");
    expect(pkg.exports["."]).toEqual({ types: "./dist/index.d.ts", default: "./dist/index.js" });
  });
  it("seule dépendance d'exécution : zod, à la même version que le monorepo", () => {
    expect(Object.keys(pkg.dependencies ?? {})).toEqual(["zod"]);
    expect(new Set(zodVersions).size).toBe(1);
    expect(pkg.dependencies.zod).toBe(zodVersions[0]);
  });
  it("expose les scripts lint, typecheck, test, build", () => {
    for (const s of ["lint", "typecheck", "test", "build"]) expect(pkg.scripts).toHaveProperty(s);
  });
  it("porte l'étiquette rules", () => {
    const turbo = JSON.parse(readFileSync(resolve(root, "turbo.json"), "utf8"));
    expect(turbo.tags).toEqual(["rules"]);
  });
});

describe("seuils de couverture", () => {
  it("fixe branches 90 et lignes 80", () => {
    expect(rulesCoverageThresholds).toEqual({ lines: 80, branches: 90 });
    const thresholds = (rulesVitestConfig as { test?: { coverage?: { thresholds?: unknown } } })
      .test?.coverage?.thresholds;
    expect(thresholds).toMatchObject({ lines: 80, branches: 90 });
  });
});

describe("API publique du lot A", () => {
  it("exporte les points d'entrée", () => {
    for (const name of [
      "parseCatalog",
      "loadBuiltInCatalog",
      "MAX_CATALOG_BYTES",
      "CATALOG_ERROR_CODES",
      "AGENT_ROLES",
      "PROFILE_KINDS",
      "catalogSchema",
      "ruleSchema",
      "profileSchema",
      "enforcementSchema",
    ]) {
      expect(rules, name).toHaveProperty(name);
    }
  });
});
