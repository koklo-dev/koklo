/** Classification minimale d'un échec du CLI ; la table complète des quotas est TK-74. */
export type ClaudeFailureKind = "quota" | "auth" | "agent_error" | "process_error";

export interface ClaudeFailureContext {
  readonly exitCode: number | null;
  /** Un message `result` avec `is_error: true` a été lu. */
  readonly resultIsError: boolean;
}

export const classifyClaudeFailure = (
  _raw: string,
  _context: ClaudeFailureContext,
): ClaudeFailureKind => {
  throw new Error("not implemented: lot 73c Green");
};
