import {
  type Branch,
  type CheckRun,
  type Commit,
  type Deployment,
  type FileContent,
  type FileListing,
  type GitAuth,
  GitConflictError,
  GitNotFoundError,
  type GitProvider,
  GitProviderError,
  type GitUserCredentials,
  type GitUserInstallation,
  type MergeResult,
  type PullRequest,
  type PullRequestComment,
  type PullRequestRef,
  type PullRequestState,
  type Repo,
  type RepoRef,
  type Tag,
  UserTokenRequiredError,
  WEBHOOK_EVENTS,
} from "@koklo/domain";
import { commitLimit } from "../commit-rules.ts";
import { FakeAuthority } from "./fake-authority.ts";
import { FakeUserOAuth } from "./fake-user-oauth.ts";
import {
  describePull,
  mergeOutcome,
  openPull,
  pullState,
  recordCheck,
  writeOnBranch,
} from "./pull-views.ts";
import {
  fileEntries,
  RepositoryState,
  type StoredCommit,
  type StoredPull,
} from "./repository-state.ts";

export type InMemoryGitProviderOptions = {
  /** Horloge injectée : expirations de jetons, dates de déploiement. */
  readonly now: () => Date;
  /** Générateur d'identifiants (jetons, commentaires, déploiements, SHA) : rend le faux déterministe. */
  readonly nextId: () => string;
  /** Identifiant d'URL de l'App rendu par `appSlug` (défaut : `koklo-fake`). */
  readonly appSlug?: string;
};

type Request<K extends keyof GitProvider> = Parameters<GitProvider[K]>[0];

const DEFAULT_APP_SLUG = "koklo-fake";

const repoKey = (repo: RepoRef): string => `${repo.owner.login}/${repo.name}`;

/**
 * Faux fournisseur Git en mémoire (incident 33) : à état, déterministe (horloge et identifiants
 * injectés), isolé par instance, sans réseau ni bibliothèque cliente HTTP. Il doit passer la même suite
 * de conformité que l'adaptateur GitHub réel ; en cas de divergence constatée en réel, c'est le
 * faux qui se corrige. À ne pas confondre avec le faux minimal et sans état de
 * `packages/domain/test`, qui prouve seulement que le port compile.
 */
export class InMemoryGitProvider implements GitProvider {
  readonly #repos = new Map<string, RepositoryState>();
  readonly #options: InMemoryGitProviderOptions;
  readonly #authority: FakeAuthority;
  readonly #userOAuth: FakeUserOAuth;

  constructor(options: InMemoryGitProviderOptions) {
    this.#options = options;
    this.#authority = new FakeAuthority(options.now, options.nextId);
    this.#userOAuth = new FakeUserOAuth(options.now, options.nextId);
  }

  /** Aide de test : crée un déploiement `success` sur la branche ou le SHA donné. */
  seedDeployment(repo: RepoRef, deployment: { environment: string; sha: string }): void {
    const state = this.#repo("seedDeployment", repo);
    state.addSuccessDeployment(deployment, this.#options.nextId(), this.#options.now());
  }

  async authenticate(request: Request<"authenticate">): Promise<GitAuth> {
    const { user } = request;
    return user === undefined ? this.#authority.installation() : this.#authority.user(user);
  }

  /** Aide de test : rend `installation` visible des jetons obtenus pour le compte `login`. */
  seedUserInstallation(login: string, installation: GitUserInstallation): void {
    this.#userOAuth.seed(login, installation);
  }

  async exchangeUserCode(request: Request<"exchangeUserCode">): Promise<GitUserCredentials> {
    return this.#userOAuth.exchange(request);
  }

  async listUserInstallations(
    request: Request<"listUserInstallations">,
  ): Promise<readonly GitUserInstallation[]> {
    return this.#userOAuth.list(request.auth);
  }

  async appSlug(): Promise<string> {
    return this.#options.appSlug ?? DEFAULT_APP_SLUG;
  }

  async createRepo(request: Request<"createRepo">): Promise<Repo> {
    const { auth, owner, name, visibility, template } = request;
    this.#authority.assertFresh("createRepo", auth);
    if (owner.kind === "user" && auth.kind !== "user") {
      throw new UserTokenRequiredError({ operation: "createRepo", owner });
    }
    const ref: RepoRef = { owner, name };
    if (this.#repos.has(repoKey(ref))) {
      throw new GitConflictError({
        operation: "createRepo",
        reason: "exists",
        identifier: repoKey(ref),
      });
    }
    const files = template === undefined ? undefined : this.#templateFiles(template);
    const repo: Repo = {
      id: this.#options.nextId(),
      ref,
      visibility,
      defaultBranch: "main",
      htmlUrl: `https://github.com/${repoKey(ref)}`,
    };
    const state = RepositoryState.initialized(repo, files, this.#options.nextId());
    this.#repos.set(repoKey(ref), state);
    return repo;
  }

  async getRepo(request: Request<"getRepo">): Promise<Repo> {
    this.#authority.assertFresh("getRepo", request.auth);
    return this.#repo("getRepo", request.repo).repo;
  }

  async readFile(request: Request<"readFile">): Promise<FileContent> {
    const { auth, repo, ref, path } = request;
    this.#authority.assertFresh("readFile", auth);
    const state = this.#repo("readFile", repo);
    const commit = this.#commitOf(state, "readFile", ref);
    const file = commit.files.get(path);
    if (file === undefined) {
      throw new GitNotFoundError({
        operation: "readFile",
        resource: "file",
        identifier: `${repoKey(repo)}:${path}@${ref}`,
      });
    }
    return { path, ref: commit.sha, content: file.content, sha: file.blob };
  }

  async writeCommit(request: Request<"writeCommit">): Promise<Commit> {
    const { auth, repo, author, message } = request;
    this.#authority.assertFresh("writeCommit", auth);
    const state = this.#repo("writeCommit", repo);
    const commit = writeOnBranch(state, request, this.#options.nextId());
    return { sha: commit.sha, message, author, parents: commit.parents };
  }

  async listFiles(request: Request<"listFiles">): Promise<FileListing> {
    const { auth, repo, ref } = request;
    this.#authority.assertFresh("listFiles", auth);
    const commit = this.#commitOf(this.#repo("listFiles", repo), "listFiles", ref);
    return { ref: commit.sha, files: fileEntries(commit.files) };
  }

  async listCommits(request: Request<"listCommits">): Promise<readonly Commit[]> {
    const { auth, repo, ref } = request;
    this.#authority.assertFresh("listCommits", auth);
    const state = this.#repo("listCommits", repo);
    const head = this.#commitOf(state, "listCommits", ref);
    return state.history(head.sha, commitLimit(request.limit));
  }

  async createBranch(request: Request<"createBranch">): Promise<Branch> {
    const { auth, repo, base, name } = request;
    this.#authority.assertFresh("createBranch", auth);
    return this.#addRef("createBranch", repo, base, name, (state) => state.branches);
  }

  async createTag(request: Request<"createTag">): Promise<Tag> {
    const { auth, repo, ref, name } = request;
    this.#authority.assertFresh("createTag", auth);
    return this.#addRef("createTag", repo, ref, name, (state) => state.tags);
  }

  async createPullRequest(request: Request<"createPullRequest">): Promise<PullRequest> {
    const { auth, repo, base, head, title, body } = request;
    this.#authority.assertFresh("createPullRequest", auth);
    const state = this.#repo("createPullRequest", repo);
    if (!state.branches.has(base) || !state.branches.has(head)) {
      throw new GitProviderError("createPullRequest");
    }
    const pull = openPull(state, { base, head, title, body });
    return describePull(state, pull);
  }

  async getPullRequestState(request: Request<"getPullRequestState">): Promise<PullRequestState> {
    this.#authority.assertFresh("getPullRequestState", request.auth);
    const { state, pull } = this.#pull("getPullRequestState", request.pullRequest);
    return pullState(state, pull);
  }

  async mergePullRequest(request: Request<"mergePullRequest">): Promise<MergeResult> {
    const { auth, pullRequest, method, expectedHeadSha } = request;
    this.#authority.assertFresh("mergePullRequest", auth);
    const { state, pull } = this.#pull("mergePullRequest", pullRequest);
    const outcome = mergeOutcome(state, pull, { method, expectedHeadSha }, this.#options.nextId());
    if ("reason" in outcome) {
      throw new GitConflictError({
        operation: "mergePullRequest",
        reason: outcome.reason,
        identifier: `${repoKey(pullRequest.repo)}#${pull.number}`,
      });
    }
    return { sha: outcome.sha };
  }

  async listDeployments(request: Request<"listDeployments">): Promise<readonly Deployment[]> {
    this.#authority.assertFresh("listDeployments", request.auth);
    const state = this.#repo("listDeployments", request.repo);
    return state.deployments.filter((d) => d.ref === request.ref || d.sha === request.ref);
  }

  async publishCheck(request: Request<"publishCheck">): Promise<CheckRun> {
    const { auth, repo, sha, check } = request;
    this.#authority.assertFresh("publishCheck", auth);
    const state = this.#repo("publishCheck", repo);
    if (!state.commits.has(sha)) {
      throw this.#notFound("publishCheck", "commit", `${repoKey(repo)}@${sha}`);
    }
    return recordCheck(state, sha, check);
  }

  async commentPullRequest(request: Request<"commentPullRequest">): Promise<PullRequestComment> {
    this.#authority.assertFresh("commentPullRequest", request.auth);
    const { state, pull } = this.#pull("commentPullRequest", request.pullRequest);
    const id = this.#options.nextId();
    return { id, htmlUrl: `${state.repo.htmlUrl}/pull/${pull.number}#issuecomment-${id}` };
  }

  async subscribeWebhooks(request: Request<"subscribeWebhooks">): Promise<void> {
    const { auth, subscription } = request;
    this.#authority.assertFresh("subscribeWebhooks", auth);
    const state = this.#repo("subscribeWebhooks", subscription.repo);
    const known: readonly string[] = WEBHOOK_EVENTS;
    if (subscription.events.some((event) => !known.includes(event))) {
      throw new GitProviderError("subscribeWebhooks");
    }
    for (const event of subscription.events) state.subscriptions.add(event);
  }

  #notFound(operation: string, resource: string, identifier: string): GitNotFoundError {
    return new GitNotFoundError({ operation, resource, identifier });
  }

  /** Pose une branche ou une étiquette sur le commit de `from` ; le nom doit être libre. */
  #addRef(
    operation: string,
    repo: RepoRef,
    from: string,
    name: string,
    refs: (state: RepositoryState) => Map<string, string>,
  ): { name: string; sha: string } {
    const state = this.#repo(operation, repo);
    const sha = this.#commitOf(state, operation, from).sha;
    const target = refs(state);
    if (target.has(name)) {
      throw new GitConflictError({ operation, reason: "exists", identifier: name });
    }
    target.set(name, sha);
    return { name, sha };
  }

  #repo(operation: string, repo: RepoRef): RepositoryState {
    const state = this.#repos.get(repoKey(repo));
    if (state === undefined) throw this.#notFound(operation, "repository", repoKey(repo));
    return state;
  }

  #commitOf(state: RepositoryState, operation: string, ref: string): StoredCommit {
    const sha = state.resolve(ref);
    if (sha === undefined) {
      throw this.#notFound(operation, "ref", `${repoKey(state.repo.ref)}@${ref}`);
    }
    return state.commit(sha);
  }

  #templateFiles(template: RepoRef) {
    const state = this.#repo("createRepo", template);
    return state.commit(state.sha(state.repo.defaultBranch)).files;
  }

  #pull(operation: string, ref: PullRequestRef): { state: RepositoryState; pull: StoredPull } {
    const state = this.#repo(operation, ref.repo);
    const pull = state.pulls.find((p) => p.number === ref.number);
    if (pull === undefined) {
      throw this.#notFound(operation, "pull request", `${repoKey(ref.repo)}#${ref.number}`);
    }
    return { state, pull };
  }
}
