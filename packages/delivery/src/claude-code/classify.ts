/** Classification d'un échec du CLI ; le quota vient de la table partagée de TK-74 (`quota-signal`). */
import { detectQuota, type QuotaSignal } from "../quota-signal.ts";

export type ClaudeFailureKind = "quota" | "auth" | "agent_error" | "process_error";

export interface ClaudeFailureContext {
  readonly exitCode: number | null;
  /** Un message `result` avec `is_error: true` a été lu. */
  readonly resultIsError: boolean;
}

export type ClaudeFailure =
  | { readonly kind: "auth" | "agent_error" | "process_error" }
  | { readonly kind: "quota"; readonly quota: QuotaSignal };

const AUTH_PATTERNS: readonly RegExp[] = [/invalid api key/i, /please run \/login\b/i];

/** Priorité : authentification, puis quota (jamais une autre cause), puis erreur d'agent ou de processus. */
export const describeClaudeFailure = (
  raw: string,
  context: ClaudeFailureContext,
): ClaudeFailure => {
  if (AUTH_PATTERNS.some((pattern) => pattern.test(raw))) {
    return { kind: "auth" };
  }
  const quota = detectQuota(raw);
  if (quota !== null) {
    return { kind: "quota", quota };
  }
  return { kind: context.resultIsError ? "agent_error" : "process_error" };
};

export const classifyClaudeFailure = (
  raw: string,
  context: ClaudeFailureContext,
): ClaudeFailureKind => describeClaudeFailure(raw, context).kind;
