/** SQUELETTE (TK-72 lot 1, étape RED). */
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

export const RUN_EVENT_TYPES: readonly RunEventType[] = [];
