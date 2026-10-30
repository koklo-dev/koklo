import type {
  Branch,
  CheckRun,
  Commit,
  Deployment,
  FileContent,
  GitAuth,
  GitOwner,
  GitProvider,
  MergeResult,
  PullRequest,
  PullRequestComment,
  PullRequestState,
  Repo,
  Tag,
} from "../src/index.ts";
import { GitConflictError, UserTokenRequiredError } from "../src/index.ts";

/** Instant fixe : le domaine ne lit jamais l'horloge. */
export const FAKE_EXPIRES_AT = "2026-10-30T12:00:00.000Z";

/** Tête courante de toute PR du faux. */
export const FAKE_HEAD_SHA = "sha-head";

const repoOf = (owner: GitOwner, name: string): Repo => ({
  ref: { owner, name },
  visibility: "private",
  defaultBranch: "main",
  htmlUrl: `https://git.test/${owner.login}/${name}`,
});

/**
 * Faux minimal : sa compilation prouve la forme du port (13 méthodes, types de
 * requête et de retour). Seul `createRepo` applique la règle de l'ADR 0009.
 */
export class FakeGitProvider implements GitProvider {
  private readonly mergeable: boolean;

  constructor(options: { readonly mergeable?: boolean } = {}) {
    this.mergeable = options.mergeable ?? true;
  }

  async authenticate(request: Parameters<GitProvider["authenticate"]>[0]): Promise<GitAuth> {
    if (request.user === undefined) {
      return { kind: "installation", token: "iat-fake", expiresAt: FAKE_EXPIRES_AT };
    }
    return { kind: "user", token: request.user.token, expiresAt: request.user.expiresAt };
  }

  async createRepo(request: Parameters<GitProvider["createRepo"]>[0]): Promise<Repo> {
    if (request.owner.kind === "user" && request.auth.kind === "installation") {
      throw new UserTokenRequiredError({ operation: "createRepo", owner: request.owner });
    }
    return repoOf(request.owner, request.name);
  }

  async readFile(request: Parameters<GitProvider["readFile"]>[0]): Promise<FileContent> {
    return { path: request.path, ref: request.ref, content: "", sha: "sha-file" };
  }

  async writeCommit(request: Parameters<GitProvider["writeCommit"]>[0]): Promise<Commit> {
    return { sha: "sha-commit", message: request.message, author: request.author, parents: [] };
  }

  async createBranch(request: Parameters<GitProvider["createBranch"]>[0]): Promise<Branch> {
    return { name: request.name, sha: "sha-branch" };
  }

  async createPullRequest(
    request: Parameters<GitProvider["createPullRequest"]>[0],
  ): Promise<PullRequest> {
    return {
      ref: { repo: request.repo, number: 1 },
      status: "open",
      headSha: FAKE_HEAD_SHA,
      baseBranch: request.base,
      headBranch: request.head,
      mergeable: null,
      checks: [],
      title: request.title,
      body: request.body,
      htmlUrl: "https://git.test/pr/1",
    };
  }

  async getPullRequestState(
    request: Parameters<GitProvider["getPullRequestState"]>[0],
  ): Promise<PullRequestState> {
    return {
      ref: request.pullRequest,
      status: "open",
      headSha: FAKE_HEAD_SHA,
      baseBranch: "main",
      headBranch: "feat/x",
      mergeable: this.mergeable,
      checks: [],
    };
  }

  async mergePullRequest(
    request: Parameters<GitProvider["mergePullRequest"]>[0],
  ): Promise<MergeResult> {
    const identifier = `${request.pullRequest.repo.name}#${request.pullRequest.number}`;
    if (request.expectedHeadSha !== FAKE_HEAD_SHA) {
      throw new GitConflictError({
        operation: "mergePullRequest",
        reason: "stale-sha",
        identifier,
      });
    }
    if (!this.mergeable) {
      throw new GitConflictError({
        operation: "mergePullRequest",
        reason: "not-mergeable",
        identifier,
      });
    }
    return { sha: "sha-merge" };
  }

  async createTag(request: Parameters<GitProvider["createTag"]>[0]): Promise<Tag> {
    return { name: request.name, sha: "sha-tag" };
  }

  async listDeployments(
    _request: Parameters<GitProvider["listDeployments"]>[0],
  ): Promise<readonly Deployment[]> {
    return [];
  }

  async publishCheck(request: Parameters<GitProvider["publishCheck"]>[0]): Promise<CheckRun> {
    return { name: request.check.name, sha: request.sha, status: request.check.status };
  }

  async commentPullRequest(
    _request: Parameters<GitProvider["commentPullRequest"]>[0],
  ): Promise<PullRequestComment> {
    return { id: "comment-1", htmlUrl: "https://git.test/pr/1#c1" };
  }

  async subscribeWebhooks(
    _request: Parameters<GitProvider["subscribeWebhooks"]>[0],
  ): Promise<void> {}
}
