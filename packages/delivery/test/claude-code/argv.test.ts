import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildClaudeArgv, claudeToolRules } from "../../src/claude-code/index.ts";
import { toolsForRole } from "../../src/index.ts";
import { makeRequest, PROMPT_TEXT, SECRET_KEY } from "../agent-helpers.ts";
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
  "--append-system-prompt",
];
const READ = "Read,Grep,Glob";
const DENY_WEB = "WebFetch,WebSearch,Read(./.env*)";

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
      req.prompt.system,
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
