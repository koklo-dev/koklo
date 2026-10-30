import type { GitAuth, GitUserCredentials } from "./git-auth.ts";
import type { CheckInput, CheckRun } from "./git-check.ts";
import type { Deployment } from "./git-deployment.ts";
import type { GitInstallation, GitOwner } from "./git-owner.ts";
import type {
  MergeMethod,
  MergeResult,
  PullRequest,
  PullRequestComment,
  PullRequestRef,
  PullRequestState,
} from "./git-pull-request.ts";
import type {
  Branch,
  Commit,
  CommitAuthor,
  FileChange,
  FileContent,
  GitRef,
  Repo,
  RepoRef,
  Sha,
  Tag,
  Visibility,
} from "./git-repo.ts";
import type { WebhookSubscription } from "./git-webhook.ts";

/**
 * Port FournisseurGit (vision §8). Toutes les opérations sont asynchrones et
 * signalent l'échec par une exception typée (sous-classe de `GitProviderError`).
 * `auth` est explicite : le port n'a pas d'état. Seul `createRepo` sur un
 * propriétaire `user` exige `auth.kind === "user"` (ADR 0009).
 *
 * Noms français du §8 : authentifier = authenticate, creerRepo = createRepo,
 * lireFichier = readFile, ecrireCommit = writeCommit, creerBranche = createBranch,
 * creerPR = createPullRequest, etatPR = getPullRequestState, fusionner =
 * mergePullRequest, poserTag = createTag, lireDeploiements = listDeployments,
 * publierCheck = publishCheck, commenterPR = commentPullRequest,
 * abonnerWebhooks = subscribeWebhooks.
 */
export interface GitProvider {
  /** Sans `user` : jeton d'installation ; avec `user` : jeton utilisateur validé. @throws GitAuthExpiredError */
  authenticate(request: {
    installation: GitInstallation;
    user?: GitUserCredentials;
  }): Promise<GitAuth>;
  /** @throws UserTokenRequiredError @throws RepoCreationForbiddenError @throws GitConflictError */
  createRepo(request: {
    auth: GitAuth;
    owner: GitOwner;
    name: string;
    visibility: Visibility;
    template?: RepoRef;
  }): Promise<Repo>;
  /** @throws GitNotFoundError */
  readFile(request: {
    auth: GitAuth;
    repo: RepoRef;
    ref: GitRef;
    path: string;
  }): Promise<FileContent>;
  /** @throws GitConflictError @throws GitNotFoundError */
  writeCommit(request: {
    auth: GitAuth;
    repo: RepoRef;
    branch: string;
    files: readonly FileChange[];
    author: CommitAuthor;
    message: string;
  }): Promise<Commit>;
  /** @throws GitConflictError @throws GitNotFoundError */
  createBranch(request: {
    auth: GitAuth;
    repo: RepoRef;
    base: GitRef;
    name: string;
  }): Promise<Branch>;
  /** @throws GitConflictError */
  createPullRequest(request: {
    auth: GitAuth;
    repo: RepoRef;
    base: string;
    head: string;
    title: string;
    body: string;
  }): Promise<PullRequest>;
  /** @throws GitNotFoundError */
  getPullRequestState(request: {
    auth: GitAuth;
    pullRequest: PullRequestRef;
  }): Promise<PullRequestState>;
  /** @throws GitConflictError (not-mergeable, stale-sha) */
  mergePullRequest(request: {
    auth: GitAuth;
    pullRequest: PullRequestRef;
    method: MergeMethod;
  }): Promise<MergeResult>;
  /** @throws GitConflictError */
  createTag(request: { auth: GitAuth; repo: RepoRef; ref: GitRef; name: string }): Promise<Tag>;
  /** Liste complète, sans pagination exposée. */
  listDeployments(request: {
    auth: GitAuth;
    repo: RepoRef;
    ref: GitRef;
  }): Promise<readonly Deployment[]>;
  publishCheck(request: {
    auth: GitAuth;
    repo: RepoRef;
    sha: Sha;
    check: CheckInput;
  }): Promise<CheckRun>;
  /** @throws GitNotFoundError */
  commentPullRequest(request: {
    auth: GitAuth;
    pullRequest: PullRequestRef;
    body: string;
  }): Promise<PullRequestComment>;
  subscribeWebhooks(request: { auth: GitAuth; subscription: WebhookSubscription }): Promise<void>;
}
