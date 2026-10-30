import { createHash } from "node:crypto";
import type { GitAuth } from "@koklo/domain";
import { Octokit } from "@octokit/core";
import { paginateRest } from "@octokit/plugin-paginate-rest";
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import {
  DEFAULT_MAX_AUTO_RETRY_MS,
  DEFAULT_RETRIES,
  DEFAULT_RETRY_BASE_DELAY_MS,
  type OctokitGitProviderOptions,
} from "./options.ts";

/** Client Octokit composé (core + plugins) : une bibliothèque, pas le métapaquet `octokit`. */
export const GitHubOctokit = Octokit.plugin(restEndpointMethods, paginateRest, throttling, retry);
export type GitHubOctokit = InstanceType<typeof GitHubOctokit>;

/** Statuts jamais rejoués : seuls les 5xx et les erreurs réseau le sont (et les GET seulement). */
const NEVER_RETRIED = [400, 401, 403, 404, 405, 409, 410, 422, 429, 451];

/** Options passées à chaque écriture : le plugin de retry ne la rejoue jamais. */
export const WRITE = { request: { retries: 0 } } as const;

const SILENT_LOG = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

/**
 * Sur quota, seule une lecture est rejouée, une fois, et si l'attente est courte ; sinon l'erreur
 * remonte (`GitRateLimitedError`) pour que le worker replanifie.
 */
function quotaPolicy(maxAutoRetryMs: number) {
  return (retryAfterSeconds: number, request: { method: string }, _: unknown, retryCount: number) =>
    maxAutoRetryMs > 0 &&
    request.method === "GET" &&
    retryCount === 0 &&
    retryAfterSeconds * 1000 <= maxAutoRetryMs;
}

/**
 * Limiteur sans attente, au contrat minimal que le plugin utilise (`key(id).schedule(opts, fn)`).
 * Évite d'importer Bottleneck juste pour désactiver l'espacement des écritures.
 */
const PASS_THROUGH = {
  key: () => ({ schedule: (_job: unknown, fn: () => unknown) => Promise.resolve(fn()) }),
} as never;

/** Client sans authentification applicative (l'appelant fournit l'`auth`). */
export function createClient(options: OctokitGitProviderOptions, auth?: string): GitHubOctokit {
  const shouldRetry = quotaPolicy(options.maxAutoRetryMs ?? DEFAULT_MAX_AUTO_RETRY_MS);
  return new GitHubOctokit({
    ...(auth === undefined ? {} : { auth }),
    ...(options.fetch === undefined ? {} : { request: { fetch: options.fetch } }),
    log: SILENT_LOG,
    throttle: {
      onRateLimit: shouldRetry,
      onSecondaryRateLimit: shouldRetry,
      ...(options.spaceWrites === false
        ? { write: PASS_THROUGH, notifications: PASS_THROUGH }
        : {}),
    },
    retry: {
      retries: options.retries ?? DEFAULT_RETRIES,
      retryAfterBaseValue: options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS,
      doNotRetry: NEVER_RETRIED,
    },
  });
}

const MAX_CACHED_CLIENTS = 64;

/**
 * Un client par identité de jeton : le throttling est par instance. La clé est une empreinte du
 * jeton, jamais le jeton ; le cache est borné (le plus ancien sort en premier).
 */
export class ClientCache {
  readonly #clients = new Map<string, GitHubOctokit>();
  readonly #options: OctokitGitProviderOptions;

  constructor(options: OctokitGitProviderOptions) {
    this.#options = options;
  }

  forAuth(auth: GitAuth): GitHubOctokit {
    const key = createHash("sha256").update(`${auth.kind}:${auth.token}`).digest("hex");
    const cached = this.#clients.get(key);
    if (cached !== undefined) return cached;
    const client = createClient(this.#options, auth.token);
    this.#clients.set(key, client);
    if (this.#clients.size > MAX_CACHED_CLIENTS) {
      const oldest = this.#clients.keys().next().value;
      if (oldest !== undefined) this.#clients.delete(oldest);
    }
    return client;
  }
}
