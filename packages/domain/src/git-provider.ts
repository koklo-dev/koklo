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
  FileListing,
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
 * Noms français du §8 : authentifier = authenticate, creerRepo = createRepo, lireRepo = getRepo,
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
  /** Lit un dépôt existant (identifiant, propriétaire, branche par défaut). @throws GitNotFoundError */
  getRepo(request: { auth: GitAuth; repo: RepoRef }): Promise<Repo>;
  /** @throws GitNotFoundError */
  readFile(request: {
    auth: GitAuth;
    repo: RepoRef;
    ref: GitRef;
    path: string;
  }): Promise<FileContent>;
  /**
   * Un seul commit (parent = tête de la branche) ; une entrée `{ path, delete: true }` supprime
   * le fichier. Si `expectedHeadSha` est fourni et diffère de la tête, rien n'est écrit.
   * @throws GitConflictError `stale-sha` (tête périmée, y compris perdue en cours d'écriture)
   * @throws GitNotFoundError
   */
  writeCommit(request: {
    auth: GitAuth;
    repo: RepoRef;
    branch: string;
    files: readonly FileChange[];
    author: CommitAuthor;
    message: string;
    expectedHeadSha?: Sha;
  }): Promise<Commit>;
  /**
   * Fichiers (hors dossiers) d'un ref, récursifs, triés par `path` ; ref : branche, tag ou SHA.
   * @throws GitNotFoundError
   */
  listFiles(request: { auth: GitAuth; repo: RepoRef; ref: GitRef }): Promise<FileListing>;
  /**
   * Commits atteignables depuis `ref`, du plus récent au plus ancien (premier parent), message
   * complet. `limit` vaut 50 par défaut et est plafonné à 50 commits.
   * @throws GitNotFoundError
   */
  listCommits(request: {
    auth: GitAuth;
    repo: RepoRef;
    ref: GitRef;
    limit?: number;
  }): Promise<readonly Commit[]>;
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
  /**
   * Fusionne uniquement si la tête courante de la PR vaut `expectedHeadSha`, la tête
   * dont la politique a été évaluée (vision §10.5) : l'adaptateur compare avant de fusionner.
   * @throws GitConflictError `stale-sha` (la tête a changé, testé en premier) ou `not-mergeable`
   */
  mergePullRequest(request: {
    auth: GitAuth;
    pullRequest: PullRequestRef;
    method: MergeMethod;
    expectedHeadSha: Sha;
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
