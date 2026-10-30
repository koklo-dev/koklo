import type { Sha } from "./git-repo.ts";

export type CheckStatus = "queued" | "in_progress" | "completed";

export type CheckConclusion =
  | "queued"
  | "in_progress"
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "timed_out"
  | "action_required";

export type CheckRun = {
  readonly name: string;
  readonly sha: Sha;
  readonly status: CheckStatus;
  readonly conclusion?: CheckConclusion;
  readonly detailsUrl?: string;
  readonly summary?: string;
};

export type CheckInput = {
  readonly name: string;
  readonly status: CheckStatus;
  readonly conclusion?: CheckConclusion;
  readonly title?: string;
  readonly summary?: string;
  readonly detailsUrl?: string;
};
