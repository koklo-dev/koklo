import type { GitAuth } from "@koklo/domain";
import { ClientCache, createClient, type GitHubOctokit } from "./client.ts";
import { type ErrorContext, mapGitHubError, statusOf } from "./errors-map.ts";
import {
  DEFAULT_MAX_PAGES,
  type GitProviderLogEntry,
  type OctokitGitProviderOptions,
} from "./options.ts";

/** Description d'une opération du port : sert au mappage d'erreurs et au journal. */
export type Operation = Omit<ErrorContext, "credential">;

const credentialOf = (auth: GitAuth): ErrorContext["credential"] => ({
  kind: auth.kind,
  refreshable: auth.kind === "user" && auth.refreshToken !== undefined,
});

/**
 * Point de passage unique des appels HTTP : choisit le client, mesure, journalise (opération,
 * statut, durée, rien d'autre) et traduit toute erreur en erreur typée du port.
 */
export class Gateway {
  readonly now: () => Date;
  readonly maxPages: number;
  readonly clientId: string | undefined;
  readonly clientSecret: string | undefined;
  readonly #options: OctokitGitProviderOptions;
  readonly #clients: ClientCache;
  #anonymous: GitHubOctokit | undefined;

  constructor(options: OctokitGitProviderOptions) {
    this.#options = options;
    this.#clients = new ClientCache(options);
    this.now = options.now;
    this.maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
  }

  /** Appel authentifié par le jeton explicite du port. */
  withAuth<T>(
    operation: Operation,
    auth: GitAuth,
    call: (octokit: GitHubOctokit) => Promise<T>,
  ): Promise<T> {
    return this.#guard(operation, credentialOf(auth), () => call(this.#clients.forAuth(auth)));
  }

  /** Appel sans jeton de port (authentification de l'application ou de l'utilisateur). */
  anonymous<T>(
    operation: Operation,
    credential: ErrorContext["credential"],
    call: (octokit: GitHubOctokit) => Promise<T>,
  ): Promise<T> {
    this.#anonymous ??= createClient(this.#options);
    const client = this.#anonymous;
    return this.#guard(operation, credential, () => call(client));
  }

  async #guard<T>(
    operation: Operation,
    credential: ErrorContext["credential"],
    call: () => Promise<T>,
  ): Promise<T> {
    const started = performance.now();
    let status: number | undefined;
    try {
      return await call();
    } catch (error) {
      status = statusOf(error);
      throw mapGitHubError(error, { ...operation, credential }, this.now);
    } finally {
      this.#log({
        operation: operation.operation,
        ...(status === undefined ? {} : { status }),
        durationMs: Math.round(performance.now() - started),
      });
    }
  }

  #log(entry: GitProviderLogEntry): void {
    this.#options.logger?.(entry);
  }
}
