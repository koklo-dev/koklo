/** Incident 25, durci par TK-130 : Koklo n'invoque aucun outil d'agent, sans exception de chemin. */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHILD_PROCESS_ALLOWLIST,
  type SourceFile,
  scanAgentBoundary,
  scanAgentDependencies,
  scanChildProcessImports,
} from "./agent-boundary-scan.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");
const SKIPPED = new Set(["node_modules", "dist", "coverage", ".next", "test", "tests"]);
const SOURCE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;
const GROUPS = ["packages", "apps"];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    if (SKIPPED.has(name)) return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : SOURCE.test(name) ? [full] : [];
  });

const read = (file: string): SourceFile => ({
  path: relative(repoRoot, file).split(sep).join("/"),
  text: readFileSync(file, "utf8"),
});

/** Dossiers des paquets et des apps. */
const workspaces = (): string[] =>
  GROUPS.flatMap((group) =>
    readdirSync(join(repoRoot, group)).map((name) => join(repoRoot, group, name)),
  );

/** `packages/*\/src` et `apps/*\/src`. */
const productionSources = (): SourceFile[] =>
  workspaces().flatMap((dir) => {
    const src = join(dir, "src");
    return existsSync(src) ? walk(src).map(read) : [];
  });

/** `package.json` de la racine, des apps, des paquets et de `e2e`. */
const manifests = (): SourceFile[] =>
  [repoRoot, join(repoRoot, "e2e"), ...workspaces()]
    .map((dir) => join(dir, "package.json"))
    .filter((file) => existsSync(file))
    .map(read);

describe("scan de frontière : la fonction pure mord", () => {
  const violating = (path: string, text: string) => scanAgentBoundary([{ path, text }]);

  it.each([
    ["spawn du binaire", `spawn("claude", ["-p"])`],
    ["execFile du binaire", `await execFile('claude', args)`],
    ["ligne de commande", ["const c = claude", "-p", "prompt"].join(" ")],
    ["SDK d'agent", `import { query } from "@anthropic-ai/claude-agent-sdk";`],
    ["drapeau d'outils", `args.push("--allowedTools", "Read")`],
    ["drapeau d'outils interdits", `"--disallowedTools"`],
    ["flux stream-json", `["--output-format", "stream-json"]`],
    ["contournement des permissions", `"--dangerously-skip-permissions"`],
    ["nom français de l'entrée", "await runtime.lancerSession(role, prompt)"],
  ])("rejette : %s", (_label, text) => {
    const found = violating("packages/delivery/src/runner.ts", text);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]).toMatchObject({ path: "packages/delivery/src/runner.ts", line: 1 });
  });

  it("rejette la même ligne dans une app, avec son numéro de ligne", () => {
    const found = violating("apps/worker/src/job.ts", `// ok\n\nspawn("claude", ["-p"]);`);
    expect(found.map((v) => v.rule)).toContain("claude-binary-spawn");
    expect(found.every((v) => v.path === "apps/worker/src/job.ts" && v.line === 3)).toBe(true);
  });

  it("n'exempte plus l'ancien dossier de l'adaptateur", () => {
    const path = "packages/delivery/src/claude-code/x.ts";
    const text = `spawn("claude", ["-p", "--allowedTools", "stream-json"])`;
    expect(violating(path, text).map((v) => v.rule)).toEqual(
      expect.arrayContaining(["claude-binary-spawn", "allowed-tools-flag", "stream-json"]),
    );
  });

  it("n'accuse pas un usage légitime (identifiant en chaîne, spawn git, nom en prose)", () => {
    for (const text of [
      `export const TOOL_IDS = ["claude-code", "codex"] as const;`,
      `spawn("git", ["status"])`,
      "// Claude est un modèle",
      `const launch = runtime.launchSession(request)`,
    ]) {
      expect(violating("packages/delivery/src/run.ts", text), text).toEqual([]);
    }
  });
});

/** Le scan par motifs est un FILET (il attrape les oublis courants), pas une preuve : un binaire
 * lancé via une variable ou un chemin construit lui échappe. La règle `child_process` ci-dessous
 * réduit la surface : hors de la liste blanche, aucun lancement de processus n'est possible. */
describe("règle : node:child_process n'est importé que par les aides de test de db", () => {
  const bad = (path: string, text: string) => scanChildProcessImports([{ path, text }]);

  it.each([
    `import { spawn } from "node:child_process";`,
    `import cp from 'child_process'`,
    `const { exec } = require("node:child_process");`,
    `const cp = await import("node:child_process");`,
    `export * from "node:child_process"`,
  ])("rejette : %s", (text) => {
    expect(bad("apps/api/src/x.ts", text)).toEqual([{ path: "apps/api/src/x.ts", line: 1 }]);
    expect(bad("packages/delivery/src/claude-code/x.ts", `\n${text}`)[0]?.line).toBe(2);
    expect(bad("packages/db/src/testing/autre.ts", text)).toHaveLength(1);
  });

  it("ignore les autres imports et la liste blanche", () => {
    expect(bad("apps/api/src/x.ts", `import { join } from "node:path";`)).toEqual([]);
    for (const path of CHILD_PROCESS_ALLOWLIST) {
      expect(bad(path, `import "node:child_process";`), path).toEqual([]);
    }
  });

  it("la liste blanche reste les deux aides de test de db, sans outil d'agent", () => {
    expect(CHILD_PROCESS_ALLOWLIST).toEqual([
      "packages/db/src/testing/prisma-cli.ts",
      "packages/db/src/testing/test-database.ts",
    ]);
    for (const file of CHILD_PROCESS_ALLOWLIST) {
      const text = readFileSync(join(repoRoot, file), "utf8");
      expect(text, file).toMatch(/child_process/);
      expect(text, file).not.toMatch(/claude|--allowedTools|stream-json/);
    }
  });
});

describe("scan des dépendances : la fonction pure mord", () => {
  const found = (manifest: object) =>
    scanAgentDependencies([{ path: "apps/x/package.json", text: JSON.stringify(manifest) }]);

  it.each(["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"])(
    "rejette un outil d'agent déclaré dans %s",
    (field) => {
      expect(found({ [field]: { "@anthropic-ai/claude-code": "1.0.0" } })).toEqual([
        { path: "apps/x/package.json", dependency: "@anthropic-ai/claude-code@1.0.0" },
      ]);
    },
  );

  it("voit un alias npm et laisse passer les autres dépendances", () => {
    const alias = { agent: "npm:@anthropic-ai/claude-agent-sdk@1.0.0" };
    expect(found({ dependencies: alias })).toHaveLength(1);
    expect(found({ dependencies: { "@anthropic-ai/sdk": "1.0.0" } })).toEqual([]);
  });
});

describe("incident-25-agent-runtime-boundary", () => {
  it("aucun packages/*/src ni apps/*/src n'invoque un outil d'agent", () => {
    const files = productionSources();
    expect(files.length).toBeGreaterThan(50);
    expect(scanAgentBoundary(files)).toEqual([]);
  });

  it("aucun packages/*/src ni apps/*/src n'importe node:child_process hors liste blanche", () => {
    expect(scanChildProcessImports(productionSources())).toEqual([]);
  });

  it("aucun package.json ne déclare un outil d'agent", () => {
    const files = manifests();
    expect(files.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        "package.json",
        "e2e/package.json",
        "apps/api/package.json",
        "packages/delivery/package.json",
      ]),
    );
    expect(scanAgentDependencies(files)).toEqual([]);
  });
});
