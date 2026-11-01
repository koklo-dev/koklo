import type { BlockCause } from "./block-cause.ts";

interface EventBase {
  readonly expectedVersion?: number;
}

export type RunEvent = EventBase &
  (
    | { readonly type: "worktree_ready"; readonly branch: string }
    | {
        readonly type: "dev_done";
        readonly diffEmpty: boolean;
        readonly remoteBranchExists: boolean;
        readonly output?: string;
      }
    | { readonly type: "gates_green" }
    | { readonly type: "gates_red" }
    | { readonly type: "pr_opened"; readonly pullRequest: string }
    | { readonly type: "ci_green" }
    | { readonly type: "ci_red" }
    | { readonly type: "ci_timeout" }
    | { readonly type: "conflict_detected" }
    | { readonly type: "verdict_approve" }
    | { readonly type: "verdict_request_changes" }
    | { readonly type: "merge_done" }
    | { readonly type: "deploy_green" }
    | {
        readonly type: "block";
        readonly cause: BlockCause;
        readonly output: string;
        readonly remoteBranchExists?: boolean;
      }
    | { readonly type: "escalate" }
    | { readonly type: "quota_hit" }
  );

export type RunEventType = RunEvent["type"];

export const RUN_EVENT_TYPES = [
  "worktree_ready",
  "dev_done",
  "gates_green",
  "gates_red",
  "pr_opened",
  "ci_green",
  "ci_red",
  "ci_timeout",
  "conflict_detected",
  "verdict_approve",
  "verdict_request_changes",
  "merge_done",
  "deploy_green",
  "block",
  "escalate",
  "quota_hit",
] as const satisfies readonly RunEventType[];
