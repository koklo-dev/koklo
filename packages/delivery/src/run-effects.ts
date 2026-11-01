import type { BlockCause } from "./block-cause.ts";

/** Commandes décrites par la machine ; le runner (TK-75/76) les exécute, la machine n'exécute rien. */
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

const effect = <T extends RunEffect>(value: T): T => Object.freeze(value);

export const PREPARE_WORKTREE = effect({ type: "prepare_worktree" });
export const START_DEV = effect({ type: "start_dev" });
export const RUN_GATES = effect({ type: "run_gates" });
export const OPEN_PR = effect({ type: "open_pr" });
export const WAIT_CI = effect({ type: "wait_ci", bounded: true });
export const START_REVIEW = effect({ type: "start_review" });
export const REQUEST_MERGE = effect({ type: "request_merge" });
export const AWAIT_DEPLOY = effect({ type: "await_deploy" });
export const ESCALATE = effect({ type: "escalate" });
export const notify = (cause: BlockCause): RunEffect => effect({ type: "notify", cause });
