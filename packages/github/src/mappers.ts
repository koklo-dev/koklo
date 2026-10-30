import type {
  CheckConclusion,
  CheckRun,
  CheckStatus,
  Commit,
  Deployment,
  DeploymentState,
  GitOwner,
  PullRequest,
  PullRequestState,
  PullRequestStatus,
  Repo,
  RepoRef,
} from "@koklo/domain";

/** Formes minimales lues dans les réponses GitHub (le reste est ignoré). */
export type ApiRepo = {
  readonly id: number | bigint | string;
  readonly name: string;
  readonly private: boolean;
  readonly default_branch: string;
  readonly html_url: string;
  readonly owner: { readonly login: string; readonly type: string };
};

export type ApiPullRequest = {
  readonly number: number;
  readonly state: string;
  readonly merged?: boolean;
  readonly mergeable?: boolean | null;
  readonly merge_commit_sha?: string | null;
  readonly title?: string;
  readonly body?: string | null;
  readonly html_url?: string;
  readonly head: { readonly sha: string; readonly ref: string };
  readonly base: { readonly ref: string };
};

export type ApiCheckRun = {
  readonly name: string;
  readonly head_sha: string;
  readonly status?: string | null;
  readonly conclusion?: string | null;
  readonly details_url?: string | null;
  readonly output?: { readonly summary?: string | null } | null;
};

export type ApiDeployment = {
  readonly id: number | bigint;
  readonly environment: string;
  readonly sha: string;
  readonly ref: string;
  readonly created_at: string;
};

export type ApiDeploymentStatus = {
  readonly state: string;
  readonly environment_url?: string | null;
};

/** Le type du propriétaire est lu chez GitHub, jamais déduit (ADR 0009). */
export const ownerOf = (owner: ApiRepo["owner"]): GitOwner => ({
  kind: owner.type === "Organization" ? "organization" : "user",
  login: owner.login,
});

export function toRepo(data: ApiRepo): Repo {
  const ref: RepoRef = { owner: ownerOf(data.owner), name: data.name };
  return {
    id: String(data.id),
    ref,
    visibility: data.private ? "private" : "public",
    defaultBranch: data.default_branch,
    htmlUrl: data.html_url,
  };
}

const CHECK_STATUSES: ReadonlySet<string> = new Set(["queued", "in_progress", "completed"]);
const CHECK_CONCLUSIONS: ReadonlySet<string> = new Set([
  "success",
  "failure",
  "neutral",
  "cancelled",
  "timed_out",
  "action_required",
]);

const checkStatus = (status: string | null | undefined): CheckStatus =>
  status !== null && status !== undefined && CHECK_STATUSES.has(status)
    ? (status as CheckStatus)
    : "queued";

/** `skipped` et `stale` n'existent pas dans le port : ils valent « neutre ». */
const checkConclusion = (conclusion: string | null | undefined): CheckConclusion | undefined => {
  if (conclusion === null || conclusion === undefined) return undefined;
  return CHECK_CONCLUSIONS.has(conclusion) ? (conclusion as CheckConclusion) : "neutral";
};

export function toCheckRun(data: ApiCheckRun): CheckRun {
  const conclusion = checkConclusion(data.conclusion);
  return {
    name: data.name,
    sha: data.head_sha,
    status: checkStatus(data.status),
    ...(conclusion === undefined ? {} : { conclusion }),
    ...(data.details_url ? { detailsUrl: data.details_url } : {}),
    ...(data.output?.summary ? { summary: data.output.summary } : {}),
  };
}

const pullStatus = (data: ApiPullRequest): PullRequestStatus =>
  data.merged === true ? "merged" : data.state === "open" ? "open" : "closed";

export function toPullRequestState(
  data: ApiPullRequest,
  repo: RepoRef,
  checks: readonly CheckRun[],
): PullRequestState {
  const status = pullStatus(data);
  return {
    ref: { repo, number: data.number },
    status,
    headSha: data.head.sha,
    baseBranch: data.base.ref,
    headBranch: data.head.ref,
    mergeable: data.mergeable ?? null,
    ...(status === "merged" && data.merge_commit_sha ? { mergedSha: data.merge_commit_sha } : {}),
    checks,
  };
}

export const toPullRequest = (
  data: ApiPullRequest,
  repo: RepoRef,
  checks: readonly CheckRun[],
): PullRequest => ({
  ...toPullRequestState(data, repo, checks),
  title: data.title ?? "",
  body: data.body ?? "",
  htmlUrl: data.html_url ?? "",
});

const DEPLOYMENT_STATES: ReadonlySet<string> = new Set([
  "in_progress",
  "success",
  "failure",
  "inactive",
  "error",
]);

/** Un déploiement sans statut, ou `queued`/`pending`, est `pending`. */
const deploymentState = (status: ApiDeploymentStatus | undefined): DeploymentState =>
  status !== undefined && DEPLOYMENT_STATES.has(status.state)
    ? (status.state as DeploymentState)
    : "pending";

export const toDeployment = (
  data: ApiDeployment,
  status: ApiDeploymentStatus | undefined,
): Deployment => ({
  id: String(data.id),
  environment: data.environment,
  sha: data.sha,
  ref: data.ref,
  state: deploymentState(status),
  ...(status?.environment_url ? { url: status.environment_url } : {}),
  createdAt: new Date(data.created_at).toISOString(),
});

/** Commit tel que renvoyé par `GET /repos/{o}/{r}/commits` (le reste est ignoré). */
export type ApiListedCommit = {
  readonly sha: string;
  readonly commit: {
    readonly message: string;
    readonly author?: { readonly name?: string | null; readonly email?: string | null } | null;
  };
  readonly parents: ReadonlyArray<{ readonly sha: string }>;
};

export const toListedCommit = (commit: ApiListedCommit): Commit => ({
  sha: commit.sha,
  message: commit.commit.message,
  author: { name: commit.commit.author?.name ?? "", email: commit.commit.author?.email ?? "" },
  parents: commit.parents.map((parent) => parent.sha),
});
