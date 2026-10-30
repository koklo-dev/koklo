import {
  type Branch,
  type CheckRun,
  type Commit,
  type Deployment,
  type FileContent,
  type GitAuth,
  GitConflictError,
  GitNotFoundError,
  type GitProvider,
  GitProviderError,
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
import { FakeAuthority } from "./fake-authority.ts";
import { completeMerge, describePull, pullState, toStoredCheck, tryMerge } from "./pull-views.ts";
import {
  RepositoryState,
  type StoredCommit,
  type StoredPull,
  withFiles,
} from "./repository-state.ts";

export type InMemoryGitProviderOptions = {
  /** Horloge injectée : expirations de jetons, dates de déploiement. */
  readonly now: () => Date;
  /** Générateur d'identifiants (jetons, commentaires, déploiements, SHA) : rend le faux déterministe. */
  readonly nextId: () => string;
};

type Request<K extends keyof GitProvider> = Parameters<GitProvider[K]>[0];

const BOT = { name: "GitHub", email: "noreply@github.com" } as const;

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

  constructor(options: InMemoryGitProviderOptions) {
    this.#options = options;
    this.#authority = new FakeAuthority(options.now, options.nextId);
  }

  /** Aide de test : crée un déploiement `success` sur la branche ou le SHA donné. */
  seedDeployment(repo: RepoRef, deployment: { environment: string; sha: string }): void {
    const state = this.#repo("seedDeployment", repo);
    const ref =
      [...state.branches].find(([, sha]) => sha === deployment.sha)?.[0] ?? deployment.sha;
    state.deployments.push({
      id: this.#options.nextId(),
      environment: deployment.environment,
      sha: deployment.sha,
      ref,
      state: "success",
      createdAt: this.#options.now().toISOString(),
    });
  }

  async authenticate(request: Request<"authenticate">): Promise<GitAuth> {
    const { user } = request;
    return user === undefined ? this.#authority.installation() : this.#authority.user(user);
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
    const state = new RepositoryState(repo);
    const initial = state.addCommit(
      {
        message: "Initial commit",
        author: BOT,
        parents: [],
        files: files ?? withFiles(new Map(), [{ path: "README.md", content: `# ${name}\n` }]),
      },
      this.#options.nextId(),
    );
    state.branches.set("main", initial.sha);
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
    const { auth, repo, branch, files, author, message } = request;
    this.#authority.assertFresh("writeCommit", auth);
    const state = this.#repo("writeCommit", repo);
    const head = state.branches.get(branch);
    if (head === undefined) {
      throw this.#notFound("writeCommit", "branch", `${repoKey(repo)}@${branch}`);
    }
    const parent = state.commit(head);
    const commit = state.addCommit(
      { message, author, parents: [head], files: withFiles(parent.files, files) },
      this.#options.nextId(),
    );
    state.branches.set(branch, commit.sha);
    return { sha: commit.sha, message, author, parents: [head] };
  }

  async createBranch(request: Request<"createBranch">): Promise<Branch> {
    const { auth, repo, base, name } = request;
    this.#authority.assertFresh("createBranch", auth);
    const state = this.#repo("createBranch", repo);
    const sha = this.#commitOf(state, "createBranch", base).sha;
    if (state.branches.has(name)) {
      throw new GitConflictError({ operation: "createBranch", reason: "exists", identifier: name });
    }
    state.branches.set(name, sha);
    return { name, sha };
  }

  async createTag(request: Request<"createTag">): Promise<Tag> {
    const { auth, repo, ref, name } = request;
    this.#authority.assertFresh("createTag", auth);
    const state = this.#repo("createTag", repo);
    const sha = this.#commitOf(state, "createTag", ref).sha;
    if (state.tags.has(name)) {
      throw new GitConflictError({ operation: "createTag", reason: "exists", identifier: name });
    }
    state.tags.set(name, sha);
    return { name, sha };
  }

  async createPullRequest(request: Request<"createPullRequest">): Promise<PullRequest> {
    const { auth, repo, base, head, title, body } = request;
    this.#authority.assertFresh("createPullRequest", auth);
    const state = this.#repo("createPullRequest", repo);
    if (!state.branches.has(base) || !state.branches.has(head)) {
      throw new GitProviderError("createPullRequest");
    }
    const open = state.pulls.find((p) => p.status === "open" && p.base === base && p.head === head);
    if (open !== undefined) {
      throw new GitConflictError({
        operation: "createPullRequest",
        reason: "exists",
        identifier: `${repoKey(repo)}: ${head} -> ${base}`,
      });
    }
    const pull: StoredPull = {
      number: state.pulls.length + 1,
      title,
      body,
      base,
      head,
      status: "open",
    };
    state.pulls.push(pull);
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
    const conflict = (reason: "stale-sha" | "not-mergeable") =>
      new GitConflictError({
        operation: "mergePullRequest",
        reason,
        identifier: `${repoKey(pullRequest.repo)}#${pull.number}`,
      });
    const headSha = state.sha(pull.head);
    if (headSha !== expectedHeadSha) throw conflict("stale-sha");
    const merge = tryMerge(state, pull);
    if (merge === undefined || "conflicts" in merge) throw conflict("not-mergeable");
    const commit = completeMerge(
      state,
      pull,
      { files: merge.files, method, headSha },
      this.#options.nextId(),
    );
    return { sha: commit.sha };
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
    const run = toStoredCheck(sha, check);
    const previous = state.checks.findIndex((c) => c.name === run.name && c.sha === sha);
    if (previous >= 0) state.checks[previous] = run;
    else state.checks.push(run);
    return run;
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
