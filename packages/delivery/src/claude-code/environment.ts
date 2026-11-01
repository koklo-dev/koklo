/** Environnement du processus fils : liste blanche (squelette du lot 73c). */
import type { AgentCredential } from "../agent-credential.ts";

export const CLAUDE_ENV_ALLOWLIST: readonly string[] = [];

export interface ChildEnvOptions {
  readonly credential?: AgentCredential;
  /** Variables explicites de l'appelant (jamais héritées), fusionnées en dernier. */
  readonly extraEnv?: Readonly<Record<string, string>>;
}

export const buildChildEnv = (
  _parent: Readonly<Record<string, string | undefined>>,
  _options: ChildEnvOptions,
): Record<string, string> => {
  throw new Error("not implemented: lot 73c Green");
};
