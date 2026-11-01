/** SQUELETTE (TK-72 lot 1, étape RED). */
import type { BlockCause } from "./block-cause.ts";

export type RunEffect =
  | { readonly type: "prepare_worktree" }
  | { readonly type: "start_dev" }
  | { readonly type: "run_gates" }
  | { readonly type: "open_pr" }
  | { readonly type: "wait_ci"; readonly bounded: true }
  | { readonly type: "start_review" }
  | { readonly type: "request_merge" }
  | { readonly type: "await_deploy" }
  | { readonly type: "escalate" }
  | { readonly type: "notify"; readonly cause: BlockCause };
