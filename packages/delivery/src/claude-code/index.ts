/** Sous-export `@koklo/delivery/claude-code` : seul endroit qui invoque l'outil d'agent. */

export {
  type ClaudeFailure,
  type ClaudeFailureContext,
  type ClaudeFailureKind,
  classifyClaudeFailure,
  describeClaudeFailure,
} from "./classify.ts";
export {
  buildClaudeArgv,
  type ClaudeToolRules,
  claudeToolRules,
  MAX_SYSTEM_PROMPT_BYTES,
} from "./command.ts";
export { buildChildEnv, type ChildEnvOptions, CLAUDE_ENV_ALLOWLIST } from "./environment.ts";
export { REDACTED, redactSecrets } from "./redact.ts";
export {
  ClaudeCodeRuntime,
  type ClaudeCodeRuntimeOptions,
  DEFAULT_CLAUDE_EXECUTABLE,
  DEFAULT_KILL_GRACE_MS,
  HARD_OUTPUT_FACTOR,
  type SpawnSpec,
} from "./runtime.ts";
export { resolveWorktree } from "./worktree.ts";
