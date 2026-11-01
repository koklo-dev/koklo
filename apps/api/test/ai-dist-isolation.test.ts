import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * TK-54b : non-embarquement du faux dans le code livré. L'api et le worker sont compilés comme
 * en production (`tsc -p tsconfig.build.json`, dans un dossier temporaire) ; aucun fichier émis ne
 * doit référencer `@koklo/domain/testing`, `@koklo/llm/testing`, `FakeLlm` ni le transport simulé,
 * et le graphe d'import des paquets `@koklo/llm` et `@koklo/domain` (entrée `.`) n'atteint jamais
 * leur dossier `testing`. Complète `packages/config/test/llm-testing-import-guard.test.ts` (sources).
 */
const root = fileURLToPath(new URL("../../..", import.meta.url));
const FORBIDDEN =
  /@koklo\/(?:domain|llm)\/testing|\/testing\/index\.js|FakeLlm|SimulatedAnthropicTransport|anthropicErrorBody/;
const outputs: Record<string, string> = {};
let scratch = "";

/** Retire les commentaires (conservés par tsc) : seule l'exécutable compte. */
const code = (file: string): string =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.(js|mjs|cjs)$/.test(entry.name)) yield path;
  }
}

function build(app: "api" | "worker"): string {
  const outDir = join(scratch, app);
  const appDir = join(root, "apps", app);
  const tsc = join(appDir, "node_modules", ".bin", "tsc");
  const result = spawnSync(tsc, ["-p", "tsconfig.build.json", "--outDir", outDir], {
    cwd: appDir,
    encoding: "utf8",
  });
  if (result.status !== 0)
    throw new Error(`tsc ${app} : ${result.stdout}${result.stderr}`.slice(0, 2000));
  return outDir;
}

/** Fichiers atteints depuis `entry` en suivant les import/export/require relatifs. */
function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file) || !statSync(file, { throwIfNoEntry: false })?.isFile()) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /(?:from\s*|import\s*\(?\s*|require\(\s*)["'](\.{1,2}\/[^"']+)["']/g,
    )) {
      queue.push(resolve(dirname(file), match[1] as string));
    }
  }
  return seen;
}

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "koklo-dist-"));
  outputs.api = build("api");
  outputs.worker = build("worker");
}, 300_000);

afterAll(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

describe("le code livré de l'api", () => {
  it("embarque l'adaptateur de production (la garde ne couvre pas du vide)", () => {
    const sources = [...walk(outputs.api as string)].map((file) => readFileSync(file, "utf8"));
    expect(sources.some((source) => /from "@koklo\/llm"/.test(source))).toBe(true);
    expect(sources.some((source) => source.includes("AnthropicProvider"))).toBe(true);
    expect(sources.some((source) => source.includes("LLM_PROVIDERS"))).toBe(true);
  });

  it("ne référence ni le faux, ni le transport simulé, ni un sous-chemin testing", () => {
    const offenders = [...walk(outputs.api as string)].filter((file) => FORBIDDEN.test(code(file)));
    expect(offenders.map((file) => file.replace(`${scratch}/`, ""))).toEqual([]);
  });

  it("n'a pas de dossier testing", () => {
    const folders = readdirSync(outputs.api as string, {
      recursive: true,
      withFileTypes: true,
    }).filter((entry) => entry.isDirectory() && entry.name === "testing");
    expect(folders).toEqual([]);
  });
});

describe("le code livré du worker", () => {
  it("ne référence ni le faux, ni le transport simulé, ni un sous-chemin testing", () => {
    const files = [...walk(outputs.worker as string)];
    expect(files.length).toBeGreaterThan(5);
    const offenders = files.filter((file) => FORBIDDEN.test(code(file)));
    expect(offenders.map((file) => file.replace(`${scratch}/`, ""))).toEqual([]);
  });
});

describe("graphe d'import à l'exécution des paquets partagés", () => {
  it.each([
    ["@koklo/llm", "packages/llm/dist/index.js"],
    ["@koklo/domain", "packages/domain/dist/index.js"],
  ])("%s (entrée « . ») n'atteint jamais son dossier testing", (_name, entry) => {
    const files = reachable(join(root, entry));
    expect(files.size).toBeGreaterThan(3);
    expect([...files].filter((file) => /\/dist\/testing\//.test(file))).toEqual([]);
  });

  it("le fichier d'entrée du paquet @koklo/llm n'exporte pas le transport simulé", async () => {
    const entry = (await import("@koklo/llm")) as Record<string, unknown>;
    expect(entry.AnthropicProvider).toBeDefined();
    expect(entry.SimulatedAnthropicTransport).toBeUndefined();
    expect(entry.anthropicErrorBody).toBeUndefined();
  });
});
