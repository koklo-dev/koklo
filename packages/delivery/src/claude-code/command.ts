/** Argv de `claude -p` (squelette du lot 73c : le Green l'implémente). */
import type { AgentSessionRequest } from "../agent-runtime.ts";

export interface ClaudeToolRules {
  readonly allowed: readonly string[];
  readonly disallowed: readonly string[];
}

/** Règles `--allowedTools` / `--disallowedTools` dérivées de la politique d'outils. */
export const claudeToolRules = (_request: AgentSessionRequest): ClaudeToolRules => {
  throw new Error("not implemented: lot 73c Green");
};

/** Argv complet (sans le binaire) ; le prompt utilisateur n'y figure jamais (stdin). */
export const buildClaudeArgv = (_request: AgentSessionRequest): string[] => {
  throw new Error("not implemented: lot 73c Green");
};
