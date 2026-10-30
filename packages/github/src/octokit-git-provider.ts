import { type GitProvider, GitProviderError, WEBHOOK_EVENTS } from "@koklo/domain";
import { Gateway } from "./gateway.ts";
import { Authenticator } from "./ops/authentication.ts";
import { listDeployments } from "./ops/deployment.ts";
import { createBranch, createTag, writeCommit } from "./ops/git-data.ts";
import {
  commentPullRequest,
  createPullRequest,
  getPullRequestState,
  mergePullRequest,
  publishCheck,
} from "./ops/pull-request.ts";
import { createRepo, getRepo, listCommits, listFiles, readFile } from "./ops/repository.ts";
import type { OctokitGitProviderOptions } from "./options.ts";

/**
 * Adaptateur GitHub du port `GitProvider` (vision §8) : GitHub App, API REST via Octokit.
 * Chaque opération reçoit son `GitAuth` ; aucune n'a d'état hormis des clients mis en cache.
 * Les erreurs sont toutes des erreurs typées du port, sans jeton ni `RequestError` en cause.
 */
export class OctokitGitProvider implements GitProvider {
  readonly #gateway: Gateway;
  readonly #authenticator: Authenticator;

  constructor(options: OctokitGitProviderOptions) {
    this.#gateway = new Gateway(options);
    this.#authenticator = new Authenticator(this.#gateway, {
      appId: options.appId,
      privateKey: options.privateKey,
    });
  }

  authenticate: GitProvider["authenticate"] = (request) =>
    this.#authenticator.authenticate(request);
  createRepo: GitProvider["createRepo"] = (request) => createRepo(this.#gateway, request);
  getRepo: GitProvider["getRepo"] = (request) => getRepo(this.#gateway, request);
  readFile: GitProvider["readFile"] = (request) => readFile(this.#gateway, request);
  writeCommit: GitProvider["writeCommit"] = (request) => writeCommit(this.#gateway, request);
  listFiles: GitProvider["listFiles"] = (request) => listFiles(this.#gateway, request);
  listCommits: GitProvider["listCommits"] = (request) => listCommits(this.#gateway, request);
  createBranch: GitProvider["createBranch"] = (request) => createBranch(this.#gateway, request);
  createPullRequest: GitProvider["createPullRequest"] = (request) =>
    createPullRequest(this.#gateway, request);
  getPullRequestState: GitProvider["getPullRequestState"] = (request) =>
    getPullRequestState(this.#gateway, request);
  mergePullRequest: GitProvider["mergePullRequest"] = (request) =>
    mergePullRequest(this.#gateway, request);
  createTag: GitProvider["createTag"] = (request) => createTag(this.#gateway, request);
  listDeployments: GitProvider["listDeployments"] = (request) =>
    listDeployments(this.#gateway, request);
  publishCheck: GitProvider["publishCheck"] = (request) => publishCheck(this.#gateway, request);
  commentPullRequest: GitProvider["commentPullRequest"] = (request) =>
    commentPullRequest(this.#gateway, request);

  /**
   * Pour une GitHub App, les événements et l'URL du webhook sont réglés dans l'App, pas par
   * dépôt (pas de permission `repository_hooks`, §8.1) : l'abonnement se limite à vérifier que
   * les événements demandés sont ceux du port. Aucun appel réseau.
   */
  subscribeWebhooks: GitProvider["subscribeWebhooks"] = async ({ subscription }) => {
    const known: readonly string[] = WEBHOOK_EVENTS;
    const unknown = subscription.events.filter((event) => !known.includes(event));
    if (unknown.length > 0) {
      throw new GitProviderError(
        "subscribeWebhooks",
        `Événements webhook inconnus : ${unknown.join(", ")}`,
      );
    }
  };
}

/** Fabrique de l'adaptateur, typée par le port. */
export const createOctokitGitProvider = (options: OctokitGitProviderOptions): GitProvider =>
  new OctokitGitProvider(options);
