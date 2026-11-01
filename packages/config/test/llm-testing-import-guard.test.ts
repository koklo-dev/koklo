import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { findForbiddenTestingImports } from "../src/forbidden-testing-imports.ts";

/**
 * Garde des faux du port LLM (TK-54a, ADR 0011, review 50c n°1). `FakeLlm` (`@koklo/domain/testing`)
 * et le transport simulé (`@koklo/llm/testing`) ne sont branchés que par les tests et le lanceur
 * de pile e2e ; ils ne doivent jamais entrer dans le code livré. Modèle : `e2e-stack-guard.test.ts`.
 */
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const SOURCE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const SKIPPED = new Set(["node_modules", "dist", ".next", ".turbo", "coverage"]);

function productionRoots(): string[] {
  return ["apps", "packages"].flatMap((group) =>
    readdirSync(join(repoRoot, group))
      .map((name) => join(repoRoot, group, name, "src"))
      .filter((dir) => statSync(dir, { throwIfNoEntry: false })?.isDirectory()),
  );
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED.has(entry.name)) yield* walk(path);
    } else if (SOURCE.test(entry.name)) yield path;
  }
}

/** Production = `src/` hors dossier `testing/` (outillage publié) et hors fichiers de test. */
const isProduction = (file: string): boolean =>
  !/\/src\/(?:.*\/)?testing\//.test(file) && !TEST_FILE.test(file);

describe("le faux LLM reste hors du code de production", () => {
  it("aucun code de production n'importe @koklo/domain/testing ni @koklo/llm/testing", () => {
    const offenders = productionRoots()
      .flatMap((dir) => [...walk(dir)])
      .filter(isProduction)
      .filter((file) => findForbiddenTestingImports(readFileSync(file, "utf8")).length > 0)
      .map((file) => relative(repoRoot, file));
    expect(offenders).toEqual([]);
  });

  it("scanne bien les sources (garde contre une garde vide)", () => {
    const files = productionRoots()
      .flatMap((dir) => [...walk(dir)])
      .filter(isProduction);
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.endsWith("packages/llm/src/anthropic/anthropic-provider.ts"))).toBe(
      true,
    );
  });
});

/** Évite que la garde des imports profonds ne lise ces exemples comme de vrais imports. */
const importFrom = (specifier: string): string => `import { x } from "${specifier}";`;

describe("détecteur d'imports interdits", () => {
  it.each([
    ['import { FakeLlm } from "@koklo/domain/testing";', "@koklo/domain/testing"],
    ["import { FakeLlm } from '@koklo/domain/testing';", "@koklo/domain/testing"],
    ['import type { Subject } from "@koklo/domain/testing";', "@koklo/domain/testing"],
    ['export * from "@koklo/llm/testing";', "@koklo/llm/testing"],
    ['export { SimulatedAnthropicTransport } from "@koklo/llm/testing";', "@koklo/llm/testing"],
    ['const m = await import("@koklo/domain/testing");', "@koklo/domain/testing"],
    ["const m = await import('@koklo/llm/testing');", "@koklo/llm/testing"],
    ['const m = require("@koklo/domain/testing");', "@koklo/domain/testing"],
    ['import fake = require("@koklo/llm/testing");', "@koklo/llm/testing"],
    ['import "@koklo/domain/testing";', "@koklo/domain/testing"],
    ['import {\n  FakeLlm,\n} from\n  "@koklo/domain/testing";', "@koklo/domain/testing"],
    [importFrom("@koklo/domain/testing/fake-llm.ts"), "@koklo/domain/testing/fake-llm.ts"],
    [
      'import { x } from "../../domain/src/testing/fake-llm.ts";',
      "../../domain/src/testing/fake-llm.ts",
    ],
    ['import { x } from "../../llm/dist/testing/index.js";', "../../llm/dist/testing/index.js"],
    [importFrom("@koklo/domain/dist/testing/index.js"), "@koklo/domain/dist/testing/index.js"],
  ])("détecte %j", (source, specifier) => {
    expect(findForbiddenTestingImports(source)).toEqual([specifier]);
  });

  it.each([
    'import { llmCredential } from "@koklo/domain";',
    'import { AnthropicProvider } from "@koklo/llm";',
    'import { x } from "./testing-helpers.ts";',
    'import { x } from "@koklo/github/testing";',
    '// import { FakeLlm } from "@koklo/domain/testing";',
    'const doc = "voir @koklo/domain/testing dans la doc";',
  ])("ignore %j", (source) => {
    expect(findForbiddenTestingImports(source)).toEqual([]);
  });

  it("rapporte chaque occurrence d'un fichier qui en cumule plusieurs", () => {
    const source = [
      'import { FakeLlm } from "@koklo/domain/testing";',
      'import { SimulatedAnthropicTransport } from "@koklo/llm/testing";',
    ].join("\n");
    expect(findForbiddenTestingImports(source)).toEqual([
      "@koklo/domain/testing",
      "@koklo/llm/testing",
    ]);
  });
});

describe("règle Biome noRestrictedImports (second filet)", () => {
  const FAKE = 'import { FakeLlm } from "@koklo/domain/testing";\nexport const f = FakeLlm;\n';
  const SIM =
    'import { SimulatedAnthropicTransport } from "@koklo/llm/testing";\nexport const t = SimulatedAnthropicTransport;\n';
  const biome = join(repoRoot, "packages/config/node_modules/.bin/biome");
  const workdirs: string[] = [];

  afterAll(() => {
    for (const dir of workdirs) rmSync(dir, { recursive: true, force: true });
  });

  /** Projet temporaire qui reprend la config Biome racine (l'héritage pointe vers le dépôt). */
  function lint(path: string, source: string) {
    const dir = mkdtempSync(join(tmpdir(), "koklo-biome-guard-"));
    workdirs.push(dir);
    const root = JSON.parse(readFileSync(join(repoRoot, "biome.json"), "utf8"));
    root.extends = [join(repoRoot, "packages/config/biome.json")];
    writeFileSync(join(dir, "biome.json"), JSON.stringify(root));
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), source);
    const result = spawnSync(biome, ["lint", path], { cwd: dir, encoding: "utf8" });
    return { status: result.status, output: result.stdout + result.stderr };
  }

  it.each([
    ["apps/api/src/llm/llm.module.ts", FAKE],
    ["apps/worker/src/main.ts", SIM],
    ["packages/delivery/src/runner.ts", FAKE],
  ])("refuse l'import du faux dans %s", (path, source) => {
    const result = lint(path, source);
    expect(result.output).toContain("noRestrictedImports");
    expect(result.status).not.toBe(0);
  });

  it.each([
    ["apps/api/test/ai.test.ts", FAKE],
    ["packages/llm/test/anthropic.test.ts", SIM],
    ["packages/domain/src/testing/other.ts", FAKE],
    ["packages/llm/src/testing/index.ts", SIM],
    ["e2e/scripts/stack.ts", FAKE],
  ])("autorise l'import du faux dans %s", (path, source) => {
    const result = lint(path, source);
    expect(result.output).not.toMatch(/noRestrictedImports|configuration/);
    expect(result.status).toBe(0);
  });

  it("garde la règle des icônes (lucide) en place", () => {
    // Construit dynamiquement : le test de design interdit cette chaîne dans tout fichier du dépôt.
    const icons = ["lucide", "react"].join("-");
    const result = lint(
      "apps/web/src/x.ts",
      `import { Home } from "${icons}";\nexport const h = Home;\n`,
    );
    expect(result.output).toContain("noRestrictedImports");
  });
});
