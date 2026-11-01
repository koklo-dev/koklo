/** Politique d'outils abstraite par rôle, indépendante de tout runtime (mapping dans l'adaptateur). */
import type { AgentRole } from "@koklo/rules";

export type AgentShellProfile = "none" | "project-checks";

export interface AgentToolPolicy {
  readonly read: true;
  readonly search: true;
  readonly write: boolean;
  readonly edit: boolean;
  readonly shell: AgentShellProfile;
  /** Chemins relatifs au worktree où l'écriture est permise (vide si `write` et `edit` sont faux). */
  readonly writablePaths: readonly string[];
  readonly network: "none";
  readonly mcp: false;
}

export const AGENT_TOOL_POLICY_KEYS: readonly (keyof AgentToolPolicy)[] = [];

/** Politique de référence d'un rôle (gelée en profondeur) ; rôle inconnu : InvalidAgentRequestError. */
export const toolsForRole = (_role: AgentRole): AgentToolPolicy => {
  throw new Error("not implemented");
};

/** Vrai si `policy` n'accorde rien de plus que `toolsForRole(role)` et n'a aucune clé inconnue. */
export const isWithinRolePolicy = (_role: AgentRole, _policy: unknown): boolean => {
  throw new Error("not implemented");
};
