/** Argv de `claude -p` : figé, dérivé de la requête ; le prompt utilisateur passe par stdin. */
import type { AgentSessionRequest } from "../agent-runtime.ts";
import type { AgentToolPolicy } from "../agent-tools.ts";

export interface ClaudeToolRules {
  readonly allowed: readonly string[];
  readonly disallowed: readonly string[];
}

const PROJECT_CHECKS: readonly string[] = [
  "Bash(pnpm test:*)",
  "Bash(pnpm lint:*)",
  "Bash(pnpm typecheck:*)",
  "Bash(pnpm build:*)",
  "Bash(git status:*)",
  "Bash(git diff:*)",
  "Bash(git add:*)",
  "Bash(git commit:*)",
];

const isFilePath = (path: string): boolean => {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.lastIndexOf(".") > 0;
};

/** `.` = tout le worktree ; un chemin avec extension est un fichier, sinon un dossier. */
const scopedRules = (tool: string, paths: readonly string[]): string[] => {
  if (paths.includes(".")) {
    return [tool];
  }
  return paths.map((path) => `${tool}(${isFilePath(path) ? path : `${path}/**`})`);
};

const allowedRules = (tools: AgentToolPolicy): string[] => [
  "Read",
  "Grep",
  "Glob",
  ...(tools.write ? scopedRules("Write", tools.writablePaths) : []),
  ...(tools.edit ? scopedRules("Edit", tools.writablePaths) : []),
  ...(tools.shell === "project-checks" ? PROJECT_CHECKS : []),
];

const disallowedRules = (tools: AgentToolPolicy): string[] => [
  ...(tools.write ? [] : ["Write"]),
  ...(tools.edit ? [] : ["Edit"]),
  "MultiEdit",
  "NotebookEdit",
  tools.shell === "none" ? "Bash" : "Bash(git push:*)",
  "WebFetch",
  "WebSearch",
  "Read(./.env*)",
];

/** Règles d'outils dérivées de la politique d'outils, sans rien d'autre. */
export const claudeToolRules = (request: AgentSessionRequest): ClaudeToolRules => ({
  allowed: allowedRules(request.tools),
  disallowed: disallowedRules(request.tools),
});

/**
 * Argv complet (sans le binaire). Jamais : contournement des permissions, répertoires
 * supplémentaires, limite de tours ni configuration MCP ; le prompt utilisateur n'y figure pas.
 */
export const buildClaudeArgv = (request: AgentSessionRequest): string[] => {
  const rules = claudeToolRules(request);
  return [
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
    String(request.budget.maxCostMicroUsd / 1_000_000),
    "--append-system-prompt",
    request.prompt.system,
    "--allowedTools",
    rules.allowed.join(","),
    "--disallowedTools",
    rules.disallowed.join(","),
  ];
};
