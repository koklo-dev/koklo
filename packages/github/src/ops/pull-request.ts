import {
  type CheckInput,
  type CheckRun,
  GitConflictError,
  type MergeResult,
  type PullRequest,
  type PullRequestComment,
  type PullRequestRef,
  type PullRequestState,
  type RepoRef,
} from "@koklo/domain";
import type { GitHubOctokit } from "../client.ts";
import { WRITE } from "../client.ts";
import type { Gateway } from "../gateway.ts";
import {
  type ApiCheckRun,
  type ApiPullRequest,
  toCheckRun,
  toPullRequest,
  toPullRequestState,
} from "../mappers.ts";
import { collectPages, PAGE_SIZE } from "../pagination.ts";
import { pullId, type Request, repoId, target } from "./shared.ts";

const pullTarget = (pull: PullRequestRef) => ({ ...target(pull.repo), pull_number: pull.number });

const describePull = (operation: string, pull: PullRequestRef) => ({
  operation,
  resource: "pull request",
  identifier: pullId(pull),
});

/** Check-runs de la tête (les plus récents par nom), toutes pages confondues. */
async function checksOf(
  gw: Gateway,
  octokit: GitHubOctokit,
  operation: string,
  input: { repo: RepoRef; sha: string },
): Promise<CheckRun[]> {
  const pages = octokit.paginate.iterator(octokit.rest.checks.listForRef, {
    ...target(input.repo),
    ref: input.sha,
    per_page: PAGE_SIZE,
  });
  const runs = await collectPages<ApiCheckRun>(pages, operation, gw.maxPages);
  return runs.map(toCheckRun);
}

export function createPullRequest(
  gw: Gateway,
  request: Request<"createPullRequest">,
): Promise<PullRequest> {
  const { auth, repo, base, head, title, body } = request;
  const operation = {
    operation: "createPullRequest",
    resource: "pull request",
    identifier: `${repoId(repo)}: ${head} -> ${base}`,
  };
  return gw.withAuth(operation, auth, async (octokit) => {
    const created = await octokit.rest.pulls.create({
      ...target(repo),
      base,
      head,
      title,
      body,
      draft: false,
      ...WRITE,
    });
    const data = created.data as ApiPullRequest;
    const checks = await checksOf(gw, octokit, "createPullRequest", { repo, sha: data.head.sha });
    return toPullRequest(data, repo, checks);
  });
}

export function getPullRequestState(
  gw: Gateway,
  request: Request<"getPullRequestState">,
): Promise<PullRequestState> {
  const { auth, pullRequest } = request;
  return gw.withAuth(describePull("getPullRequestState", pullRequest), auth, async (octokit) => {
    const response = await octokit.rest.pulls.get(pullTarget(pullRequest));
    const data = response.data as ApiPullRequest;
    const checks = await checksOf(gw, octokit, "getPullRequestState", {
      repo: pullRequest.repo,
      sha: data.head.sha,
    });
    return toPullRequestState(data, pullRequest.repo, checks);
  });
}

/**
 * Compare la tête courante à `expectedHeadSha` AVANT toute écriture (stale-sha testé en
 * premier), puis fusionne avec le paramètre natif `sha` : GitHub répond 409 si la tête a
 * bougé entre-temps. Jamais rejoué automatiquement.
 */
export function mergePullRequest(
  gw: Gateway,
  request: Request<"mergePullRequest">,
): Promise<MergeResult> {
  const { auth, pullRequest, method, expectedHeadSha } = request;
  const operation = {
    ...describePull("mergePullRequest", pullRequest),
    conflict: "stale-sha",
  } as const;
  return gw.withAuth(operation, auth, async (octokit) => {
    const current = await octokit.rest.pulls.get(pullTarget(pullRequest));
    if ((current.data as ApiPullRequest).head.sha !== expectedHeadSha) {
      throw new GitConflictError({
        operation: "mergePullRequest",
        reason: "stale-sha",
        identifier: pullId(pullRequest),
      });
    }
    const merged = await octokit.rest.pulls.merge({
      ...pullTarget(pullRequest),
      merge_method: method,
      sha: expectedHeadSha,
      ...WRITE,
    });
    if (!merged.data.merged) {
      throw new GitConflictError({
        operation: "mergePullRequest",
        reason: "not-mergeable",
        identifier: pullId(pullRequest),
      });
    }
    return { sha: merged.data.sha };
  });
}

export function commentPullRequest(
  gw: Gateway,
  request: Request<"commentPullRequest">,
): Promise<PullRequestComment> {
  const { auth, pullRequest, body } = request;
  return gw.withAuth(describePull("commentPullRequest", pullRequest), auth, async (octokit) => {
    const comment = await octokit.rest.issues.createComment({
      ...target(pullRequest.repo),
      issue_number: pullRequest.number,
      body,
      ...WRITE,
    });
    return { id: String(comment.data.id), htmlUrl: comment.data.html_url };
  });
}

/** `queued` et `in_progress` ne sont pas des conclusions chez GitHub : elles ne sont pas envoyées. */
const sendableConclusion = (check: CheckInput) =>
  check.conclusion === undefined ||
  check.conclusion === "queued" ||
  check.conclusion === "in_progress"
    ? {}
    : { conclusion: check.conclusion };

export function publishCheck(gw: Gateway, request: Request<"publishCheck">): Promise<CheckRun> {
  const { auth, repo, sha, check } = request;
  const operation = {
    operation: "publishCheck",
    resource: "commit",
    identifier: `${repoId(repo)}@${sha}`,
  };
  const hasOutput = check.title !== undefined || check.summary !== undefined;
  return gw.withAuth(operation, auth, async (octokit) => {
    const created = await octokit.rest.checks.create({
      ...target(repo),
      name: check.name,
      head_sha: sha,
      status: check.status,
      ...sendableConclusion(check),
      ...(check.detailsUrl === undefined ? {} : { details_url: check.detailsUrl }),
      ...(hasOutput
        ? { output: { title: check.title ?? check.name, summary: check.summary ?? "" } }
        : {}),
      ...WRITE,
    });
    return toCheckRun(created.data as ApiCheckRun);
  });
}
