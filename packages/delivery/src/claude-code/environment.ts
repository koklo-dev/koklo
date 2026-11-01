/** Environnement du processus fils : liste blanche, aucun secret hérité du parent. */
import { type AgentCredential, revealAgentCredential } from "../agent-credential.ts";

/** HOME est hérité volontairement : il porte le login d'abonnement du CLI. */
export const CLAUDE_ENV_ALLOWLIST: readonly string[] = [
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "TMPDIR",
  "TZ",
  "USER",
  "LOGNAME",
];

export interface ChildEnvOptions {
  readonly credential?: AgentCredential;
  /** Variables explicites de l'appelant (jamais héritées), fusionnées en dernier. */
  readonly extraEnv?: Readonly<Record<string, string>>;
}

export const buildChildEnv = (
  parent: Readonly<Record<string, string | undefined>>,
  options: ChildEnvOptions,
): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const name of CLAUDE_ENV_ALLOWLIST) {
    const value = parent[name];
    if (value !== undefined) {
      env[name] = value;
    }
  }
  if (options.credential !== undefined) {
    env.ANTHROPIC_API_KEY = revealAgentCredential(options.credential);
  }
  return { ...env, ...options.extraEnv };
};
