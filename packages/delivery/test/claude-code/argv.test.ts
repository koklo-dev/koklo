import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildClaudeArgv,
  claudeToolRules,
  MAX_SYSTEM_PROMPT_BYTES,
} from "../../src/claude-code/index.ts";
import { InvalidAgentRequestError, toolsForRole } from "../../src/index.ts";
import { makeRequest, PROMPT_TEXT, SECRET_KEY, thrownBy } from "../agent-helpers.ts";
import {
  launches,
  makeRuntime,
  makeSandbox,
  recordedArgv,
  recordedCwd,
  recordedStdin,
  script,
} from "./support.ts";

const request = (role: Parameters<typeof toolsForRole>[0]) =>
  makeRequest({ role, tools: toolsForRole(role), credential: undefined });

const COMMON = [
  "-p",
  "--output-format",
  "stream-json",
  "--verbose",
  "--no-session-persistence",
  "--strict-mcp-config",
  "--permission-mode",
  "dontAsk",
  "--permission-prompts",
  "none",
  "--max-budget-usd",
  "2",
];
const READ = "Read,Grep,Glob";
const DENY_WEB =
  "WebFetch,WebSearch,Read(./.env*),Read(~/.ssh/**),Read(~/.aws/**),Read(~/.config/**),Read(~/.claude/.credentials*)";

const GOLDEN: [string, string, string][] = [
  [
    "developer",
    `${READ},Write,Edit,Bash(pnpm test:*),Bash(pnpm lint:*),Bash(pnpm typecheck:*),Bash(pnpm build:*),Bash(git status:*),Bash(git diff:*),Bash(git add:*),Bash(git commit:*)`,
    `MultiEdit,NotebookEdit,Bash(git push:*),${DENY_WEB}`,
  ],
  ["qa-reviewer", READ, `Write,Edit,MultiEdit,NotebookEdit,Bash,${DENY_WEB}`],
  ["tech-lead", READ, `Write,Edit,MultiEdit,NotebookEdit,Bash,${DENY_WEB}`],
  [
    "doc-writer",
    `${READ},Write(docs/**),Write(README.md),Edit(docs/**),Edit(README.md)`,
    `MultiEdit,NotebookEdit,Bash,${DENY_WEB}`,
  ],
];

describe("argv de claude -p : golden par role", () => {
  it.each(GOLDEN)("fige l'argv du role %s", (role, allowed, disallowed) => {
    const req = request(role as Parameters<typeof toolsForRole>[0]);
    expect(buildClaudeArgv(req)).toEqual([
      ...COMMON,
      `--append-system-prompt=${req.prompt.system}`,
      "--allowedTools",
      allowed,
      "--disallowedTools",
      disallowed,
    ]);
  });

  it("derive les regles d'outils de la politique, sans rien d'autre", () => {
    const rules = claudeToolRules(request("qa-reviewer"));
    expect(rules.allowed).toEqual(["Read", "Grep", "Glob"]);
    expect(rules.disallowed).toContain("Bash");
    expect(rules.disallowed).toContain("Write");
  });
});

describe("argv de claude -p : interdits", () => {
  const roles = [
    "developer",
    "qa-reviewer",
    "tech-lead",
    "doc-writer",
    "analyst",
    "designer",
  ] as const;

  it.each(roles)("n'emet jamais d'option dangereuse pour %s", (role) => {
    const argv = buildClaudeArgv(request(role));
    const joined = argv.join("\u0000");
    for (const forbidden of [
      "--dangerously-skip-permissions",
      "--allow-dangerously-skip-permissions",
      "bypassPermissions",
      "--add-dir",
      "--max-turns",
      "--mcp-config",
      "--settings",
    ]) {
      expect(joined, forbidden).not.toContain(forbidden);
    }
    expect(argv).toContain("--strict-mcp-config");
    expect(argv).toContain("--no-session-persistence");
  });

  it("ne met ni le prompt utilisateur ni la cle en argv", () => {
    const req = makeRequest();
    const joined = buildClaudeArgv(req).join("\n");
    expect(joined).not.toContain(PROMPT_TEXT);
    expect(joined).not.toContain(SECRET_KEY);
  });

  it("convertit le plafond de cout (micro-dollars) en dollars", () => {
    const argv = buildClaudeArgv(
      makeRequest({ budget: { ...makeRequest().budget, maxCostMicroUsd: 2_500_000 } }),
    );
    expect(argv[argv.indexOf("--max-budget-usd") + 1]).toBe("2.5");
  });
});

describe("argv et stdin reellement recus par le faux executable", () => {
  it("passe le prompt utilisateur par stdin et l'argv fige, cwd = worktree reel", async () => {
    const sandbox = makeSandbox();
    script(sandbox, { scenario: "completed" });
    const req = makeRequest({ worktree: sandbox.worktree });
    await makeRuntime(sandbox).launchSession(req);
    expect(launches(sandbox)).toBe(1);
    expect(recordedArgv(sandbox)).toEqual(buildClaudeArgv(req));
    expect(recordedStdin(sandbox)).toContain(PROMPT_TEXT);
    expect(recordedArgv(sandbox).join("\n")).not.toContain(PROMPT_TEXT);
  });

  it("un prompt commencant par un tiret n'est jamais pris pour une option", async () => {
    const sandbox = makeSandbox();
    script(sandbox, { scenario: "completed" });
    const prompt = makeRequest().prompt;
    await makeRuntime(sandbox).launchSession(makeRequest({ worktree: sandbox.worktree, prompt }));
    expect(recordedArgv(sandbox)).not.toContain(prompt.user);
  });

  it("n'utilise pas de shell : les metacaracteres d'un chemin restent litteraux", async () => {
    const sandbox = makeSandbox();
    script(sandbox, { scenario: "completed" });
    const worktree = join(sandbox.root, "we ird;touch PWNED$(id)");
    mkdirSync(worktree);
    const result = await makeRuntime(sandbox).launchSession(makeRequest({ worktree }));
    expect(result.status).toBe("completed");
    expect(existsSync(join(sandbox.root, "PWNED"))).toBe(false);
    expect(existsSync(join(worktree, "PWNED"))).toBe(false);
    expect(recordedCwd(sandbox)).toBe(worktree);
  });
});

describe("argv : le prompt systeme", () => {
  it("passe le prompt systeme en un seul element `--append-system-prompt=<v>`", () => {
    const argv = buildClaudeArgv(makeRequest());
    expect(argv.filter((a) => a.startsWith("--append-system-prompt"))).toHaveLength(1);
    expect(argv).not.toContain("--append-system-prompt");
  });

  it("refuse un prompt systeme au-dela du plafond (typé, bien en dessous de MAX_ARG_STRLEN)", () => {
    expect(MAX_SYSTEM_PROMPT_BYTES).toBeLessThanOrEqual(64 * 1024);
    const base = makeRequest();
    const big = {
      ...base,
      prompt: { ...base.prompt, system: "a".repeat(MAX_SYSTEM_PROMPT_BYTES + 1) },
    };
    const error = thrownBy(() => buildClaudeArgv(big as typeof base));
    expect(error).toBeInstanceOf(InvalidAgentRequestError);
    expect((error as InvalidAgentRequestError).reason).toBe("prompt");
  });

  it("compte des octets, pas des caracteres", () => {
    const base = makeRequest();
    const system = "é".repeat(MAX_SYSTEM_PROMPT_BYTES / 2 + 1);
    const big = { ...base, prompt: { ...base.prompt, system } };
    expect(thrownBy(() => buildClaudeArgv(big as typeof base))).toBeInstanceOf(
      InvalidAgentRequestError,
    );
  });
});

describe("regles d'outils generees : aucun chemin n'elargit les droits (B1)", () => {
  const TOOL_NAMES =
    /^(Read|Grep|Glob|Write|Edit|Bash|MultiEdit|NotebookEdit|WebFetch|WebSearch)(\(|$)/;

  it("refuse de generer des regles pour un chemin hostile, meme hors garde de requete", () => {
    const base = makeRequest({ role: "doc-writer", tools: toolsForRole("doc-writer") });
    for (const path of ["docs/x),Bash(*", "docs/**", "docs/x,Bash", "../etc", "/etc"]) {
      const hostile = { ...base, tools: { ...base.tools, writablePaths: [path] } };
      expect(
        thrownBy(() => claudeToolRules(hostile as typeof base)),
        path,
      ).toBeInstanceOf(InvalidAgentRequestError);
    }
  });

  it.each(["doc-writer", "designer", "qa-reviewer", "developer"] as const)(
    "%s : seules des regles prevues apparaissent, Bash seulement avec un shell",
    (role) => {
      const req = request(role);
      const rules = claudeToolRules(req);
      const all = [...rules.allowed, ...rules.disallowed];
      expect(all.every((rule) => TOOL_NAMES.test(rule))).toBe(true);
      const bashAllowed = rules.allowed.filter((rule) => rule.startsWith("Bash"));
      expect(bashAllowed.length > 0).toBe(req.tools.shell !== "none");
      for (const rule of rules.allowed.filter((r) => /^(Write|Edit)\(/.test(r))) {
        expect(rule).toMatch(/^(Write|Edit)\([A-Za-z0-9._/-]+(\/\*\*)?\)$/);
      }
    },
  );
});
