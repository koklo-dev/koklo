import type { GitRef, Sha } from "./git-repo.ts";

export type DeploymentState =
  | "pending"
  | "in_progress"
  | "success"
  | "failure"
  | "inactive"
  | "error";

export type Deployment = {
  readonly id: string;
  readonly environment: string;
  readonly sha: Sha;
  readonly ref: GitRef;
  readonly state: DeploymentState;
  readonly url?: string;
  readonly createdAt: string;
};
