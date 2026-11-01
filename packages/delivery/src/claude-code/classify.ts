/** Classification minimale d'un échec du CLI ; la table complète des quotas est TK-74. */
export type ClaudeFailureKind = "quota" | "auth" | "agent_error" | "process_error";

export interface ClaudeFailureContext {
  readonly exitCode: number | null;
  /** Un message `result` avec `is_error: true` a été lu. */
  readonly resultIsError: boolean;
}

/** Jamais un simple « limit » : seules des formulations de quota sans ambiguïté. */
const QUOTA_PATTERNS: readonly RegExp[] = [
  /usage limit/i,
  /5-hour limit/i,
  /weekly limit/i,
  /hit your limit/i,
  /rate_limit_error/i,
  /too many requests/i,
  /\b429\b/,
];

const AUTH_PATTERNS: readonly RegExp[] = [/invalid api key/i, /\/login\b/];

const matchesAny = (patterns: readonly RegExp[], raw: string): boolean =>
  patterns.some((pattern) => pattern.test(raw));

/** L'authentification d'abord (le quota n'est jamais un échec d'identité), puis le quota. */
export const classifyClaudeFailure = (
  raw: string,
  context: ClaudeFailureContext,
): ClaudeFailureKind => {
  if (matchesAny(AUTH_PATTERNS, raw)) {
    return "auth";
  }
  if (matchesAny(QUOTA_PATTERNS, raw)) {
    return "quota";
  }
  return context.resultIsError ? "agent_error" : "process_error";
};
