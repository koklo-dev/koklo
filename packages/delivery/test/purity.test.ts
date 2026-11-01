import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as delivery from "../src/index.ts";
import deliveryVitestConfig, { deliveryCoverageThresholds } from "../vitest.config.ts";

const root = resolve(import.meta.dirname, "..");
const srcDir = resolve(root, "src");
const FILES = [
  "agent-budget.ts",
  "agent-credential.ts",
  "agent-errors.ts",
  "agent-output.ts",
  "agent-request.ts",
  "agent-runtime.ts",
  "agent-tools.ts",
  "block-cause.ts",
  "errors.ts",
  "index.ts",
  "run-effects.ts",
  "run-event.ts",
  "run-resume.ts",
  "run-state.ts",
  "run-transitions.ts",
  "run.ts",
];
/** Cœur pur : `src/*.ts` et `src/testing/*.ts` ; `src/claude-code/` (lot 73c, I/O) en est exclu. */
const CORE_DIRS = ["", "testing"] as const;
const sources = () =>
  CORE_DIRS.flatMap((dir) =>
    readdirSync(resolve(srcDir, dir), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => {
        const file = dir === "" ? entry.name : `${dir}/${entry.name}`;
        return { file, text: readFileSync(resolve(srcDir, file), "utf8") };
      }),
  );
const importsOf = (source: string) =>
  [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1] as string);

const OPENER = /(=>\s*\{|\bfunction\b[^{]*\{|^\s*\w+\s*\([^)]*\)\s*(?::[^{]+)?\{)\s*$/;

const braceDelta = (line: string): number =>
  [...line].reduce((sum, ch) => sum + (ch === "{" ? 1 : ch === "}" ? -1 : 0), 0);

/** Longueur (en lignes) du corps de fonction qui s'ouvre à la ligne `start`. */
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

describe("pureté de packages/delivery", () => {
  it("contient les fichiers attendus", () => {
    expect(readdirSync(srcDir).sort()).toEqual(expect.arrayContaining(FILES));
  });

  it("contient les fichiers du faux et de la conformité sous src/testing", () => {
    expect(readdirSync(resolve(srcDir, "testing")).sort()).toEqual(
      expect.arrayContaining(["agent-conformance.ts", "fake-agent-runtime.ts", "index.ts"]),
    );
  });

  it("n'importe que du relatif, @koklo/domain ou @koklo/rules (ni node:*, fs, Prisma, Nest, Octokit)", () => {
    for (const { file, text } of sources()) {
      for (const spec of importsOf(text)) {
        const ok =
          spec.startsWith("./") ||
          (file.startsWith("testing/") && spec.startsWith("../")) ||
          spec === "@koklo/domain" ||
          spec === "@koklo/rules";
        expect(ok, `${file} importe « ${spec} »`).toBe(true);
      }
    }
  });

  it("n'utilise ni horloge, ni aléa, ni I/O, ni variables d'environnement", () => {
    const forbidden =
      /\b(Date\.now|new Date|Math\.random|crypto\.|randomUUID|process\.|setTimeout|setInterval|fetch\(|performance\.now|require\()/;
    for (const { file, text } of sources()) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(forbidden.test(code), `${file} utilise une API impure`).toBe(false);
    }
  });
});

describe("pureté de packages/delivery : frontières", () => {
  it("le cœur ne dépend jamais de l'adaptateur src/claude-code/ ni de node:*", () => {
    for (const { file, text } of sources()) {
      expect(/claude-code|node:|child_process/.test(importsOf(text).join("\n")), file).toBe(false);
    }
  });

  it("l'index public n'exporte ni le faux ni la suite de conformité", () => {
    const index = readFileSync(resolve(srcDir, "index.ts"), "utf8");
    expect(/testing|FakeAgent|Conformance/.test(index)).toBe(false);
    expect(delivery).not.toHaveProperty("FakeAgentRuntime");
    expect(delivery).not.toHaveProperty("runAgentRuntimeConformance");
  });

  it("garde chaque fichier à 300 lignes au plus et chaque fonction à 50 lignes au plus", () => {
    for (const { file, text } of sources()) {
      expect(text.split("\n").length, `${file} dépasse 300 lignes`).toBeLessThanOrEqual(300);
      for (const length of functionLengths(text)) {
        expect(length, `${file} : fonction de ${length} lignes`).toBeLessThanOrEqual(50);
      }
    }
  });
});

describe("pureté de packages/delivery : API", () => {
  it("exporte l'API publique figée", () => {
    for (const name of [
      "RUN_STATES",
      "isRunState",
      "isTerminal",
      "BLOCK_CAUSES",
      "isBlockCause",
      "createBlock",
      "RUN_EVENT_TYPES",
      "startRun",
      "applyEvent",
      "canApply",
      "allowedEvents",
      "resumePoint",
      "InvalidRunStateError",
      "InvalidRunEventError",
      "InvalidRunTransitionError",
      "StaleRunError",
      "ResumeRequiredError",
      "canRestartDevelopment",
      "AGENT_RUNTIME_IDS",
      "AGENT_RESULT_STATUSES",
      "AGENT_FAILURE_REASONS",
      "AGENT_TRACE_PATTERN",
      "AGENT_MAX_TIMEOUT_MS",
      "AGENT_MAX_COST_MICRO_USD",
      "AGENT_MAX_OUTPUT_CHARS",
      "AGENT_MAX_PROMPT_CHARS",
      "AGENT_TOOL_POLICY_KEYS",
      "assertSessionRequest",
      "assertAgentBudget",
      "toolsForRole",
      "isWithinRolePolicy",
      "countsAsAgentFailure",
      "agentCredential",
      "isAgentCredential",
      "revealAgentCredential",
      "agentOutput",
      "isAgentOutput",
      "AgentRuntimeError",
      "InvalidAgentRequestError",
      "InvalidAgentBudgetError",
      "AgentBudgetExceededError",
      "AgentRuntimeUnavailableError",
      "AgentAuthError",
      "InvalidAgentCredentialError",
    ]) {
      expect(delivery, name).toHaveProperty(name);
    }
  });
});

describe("package.json, étiquette et seuils", () => {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

  it("ne dépend à l'exécution que de @koklo/domain et @koklo/rules, en workspace", () => {
    expect(pkg.dependencies).toEqual({
      "@koklo/domain": "workspace:*",
      "@koklo/rules": "workspace:*",
    });
  });

  it("exporte « . » et « ./testing » (« ./claude-code » seulement au lot 73c)", () => {
    const keys = Object.keys(pkg.exports);
    expect(keys).toEqual(expect.arrayContaining([".", "./testing"]));
    for (const key of keys) {
      expect([".", "./testing", "./claude-code"]).toContain(key);
    }
    expect(pkg.exports["./testing"]).toEqual({
      types: "./dist/testing/index.d.ts",
      default: "./dist/testing/index.js",
    });
  });

  it("porte l'étiquette delivery", () => {
    const turbo = JSON.parse(readFileSync(resolve(root, "turbo.json"), "utf8"));
    expect(turbo.tags).toEqual(["delivery"]);
  });

  it("fixe la couverture à branches 90 et lignes 80 (CDC §19.2)", () => {
    expect(deliveryCoverageThresholds).toEqual({ lines: 80, branches: 90 });
    const thresholds = (deliveryVitestConfig as { test?: { coverage?: { thresholds?: unknown } } })
      .test?.coverage?.thresholds;
    expect(thresholds).toMatchObject({ lines: 80, branches: 90 });
  });
});
