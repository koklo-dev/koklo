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

const FORBIDDEN_EXTRA_ENV = /^(?:LD_.*|DYLD_.*|NODE_OPTIONS|PATH|HOME|ANTHROPIC_.*)$/;

/**
 * Noms que l'appelant ne peut pas imposer au fils : chargement de code (`LD_*`, `DYLD_*`,
 * `NODE_OPTIONS`), résolution (`PATH`, `HOME`) et `ANTHROPIC_*` (la clé n'est injectée que par le
 * runtime, via le credential opaque).
 */
export const isForbiddenExtraEnv = (name: string): boolean =>
  FORBIDDEN_EXTRA_ENV.test(name.toUpperCase());

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
  for (const [name, value] of Object.entries(options.extraEnv ?? {})) {
    if (!isForbiddenExtraEnv(name)) {
      env[name] = value;
    }
  }
  return env;
};
