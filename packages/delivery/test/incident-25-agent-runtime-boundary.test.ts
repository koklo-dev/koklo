/** Critere d'acceptation de TK-73 : aucune invocation d'outil d'agent hors de l'adaptateur. */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { ADAPTER_PREFIX, type SourceFile, scanAgentBoundary } from "./agent-boundary-scan.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");
const SKIPPED = new Set(["node_modules", "dist", "coverage", ".next", "test", "tests"]);
const SOURCE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    if (SKIPPED.has(name)) return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : SOURCE.test(name) ? [full] : [];
  });

/** `packages/*\/src` et `apps/*\/src`. */
const productionSources = (): SourceFile[] =>
  ["packages", "apps"].flatMap((group) =>
    readdirSync(join(repoRoot, group)).flatMap((pkg) => {
      const src = join(repoRoot, group, pkg, "src");
      return existsSync(src)
        ? walk(src).map((file) => ({
            path: relative(repoRoot, file).split(sep).join("/"),
            text: readFileSync(file, "utf8"),
          }))
        : [];
    }),
  );

describe("scan de frontiere : la fonction pure mord", () => {
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
    ["nom francais de l'entree", "await runtime.lancerSession(role, prompt)"],
  ])("rejette hors de l'adaptateur : %s", (_label, text) => {
    const found = violating("packages/delivery/src/runner.ts", text);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]).toMatchObject({ path: "packages/delivery/src/runner.ts", line: 1 });
  });

  it("rejette la meme ligne dans une app, avec son numero de ligne", () => {
    const found = violating("apps/worker/src/job.ts", `// ok\n\nspawn("claude", ["-p"]);`);
    expect(found.map((v) => v.rule)).toContain("claude-binary-spawn");
    expect(found.every((v) => v.path === "apps/worker/src/job.ts" && v.line === 3)).toBe(true);
  });

  it("autorise les memes lignes dans packages/delivery/src/claude-code/", () => {
    const text = `spawn("claude", ["-p", "--allowedTools", "stream-json", "--dangerously-skip-permissions"])`;
    expect(violating(`${ADAPTER_PREFIX}command.ts`, text)).toEqual([]);
    expect(violating("packages/delivery/src/claude-code-like.ts", text)).not.toEqual([]);
  });

  it("n'accuse pas un usage legitime (id du runtime, spawn git, mot claude en prose)", () => {
    for (const text of [
      `export const AGENT_RUNTIME_IDS = ["claude-code", "fake"] as const;`,
      `spawn("git", ["status"])`,
      "// Claude est un modele",
      `const launch = runtime.launchSession(request)`,
    ]) {
      expect(violating("packages/delivery/src/agent-runtime.ts", text), text).toEqual([]);
    }
  });
});

describe("incident-25-agent-runtime-boundary", () => {
  it("aucun fichier de packages/*/src ni apps/*/src n'invoque un outil d'agent hors de l'adaptateur", () => {
    const files = productionSources();
    expect(files.length).toBeGreaterThan(50);
    expect(scanAgentBoundary(files)).toEqual([]);
  });

  it("l'adaptateur est l'endroit qui porte l'invocation (le scan ne passe pas a vide)", () => {
    const adapter = productionSources().filter((file) => file.path.startsWith(ADAPTER_PREFIX));
    const text = adapter.map((file) => file.text).join("\n");
    expect(text).toContain("--allowedTools");
    expect(text).toContain("stream-json");
    expect(text).toContain("child_process");
    expect(text).not.toContain("--dangerously-skip-permissions");
  });

  it("le coeur du paquet (src/*.ts, src/testing) ne reference jamais l'adaptateur", () => {
    const core = productionSources().filter(
      (file) =>
        file.path.startsWith("packages/delivery/src/") && !file.path.startsWith(ADAPTER_PREFIX),
    );
    for (const file of core) {
      expect(/from\s+["'][^"']*claude-code/.test(file.text), file.path).toBe(false);
    }
  });

  it("aucun autre paquet ni app ne depend de l'adaptateur sauf par le sous-export", () => {
    for (const file of productionSources()) {
      if (file.path.startsWith("packages/delivery/")) continue;
      expect(/delivery\/src\/claude-code/.test(file.text), file.path).toBe(false);
    }
  });

  it("package.json : dependances inchangees et sous-export ./claude-code seulement en plus", () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "packages/delivery/package.json"), "utf8"),
    ) as { dependencies: unknown; exports: Record<string, unknown> };
    expect(pkg.dependencies).toEqual({
      "@koklo/domain": "workspace:*",
      "@koklo/rules": "workspace:*",
    });
    expect(Object.keys(pkg.exports).sort()).toEqual([".", "./claude-code", "./testing"]);
  });
});
