import type { CheckRun } from "./git-check.ts";
import type { RepoRef, Sha } from "./git-repo.ts";

export type PullRequestRef = { readonly repo: RepoRef; readonly number: number };
export type PullRequestStatus = "open" | "closed" | "merged";
export type MergeMethod = "merge" | "squash" | "rebase";

export type PullRequestState = {
  readonly ref: PullRequestRef;
  readonly status: PullRequestStatus;
  readonly headSha: Sha;
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly mergeable: boolean | null;
  readonly mergedSha?: Sha;
  readonly checks: readonly CheckRun[];
};

export type PullRequest = PullRequestState & {
  readonly title: string;
  readonly body: string;
  readonly htmlUrl: string;
};

export type MergeResult = { readonly sha: Sha };
export type PullRequestComment = { readonly id: string; readonly htmlUrl: string };
