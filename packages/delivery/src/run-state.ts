/** SQUELETTE (TK-72 lot 1, étape RED) : le Green remplit la liste, la garde et les terminaux. */
export type RunState =
  | "leased"
  | "developing"
  | "local_gates"
  | "pr_open"
  | "ci_wait"
  | "reviewing"
  | "merge_requested"
  | "merged"
  | "deployed_staging"
  | "blocked"
  | "escalated";

export const RUN_STATES: readonly RunState[] = [];

export const isRunState = (_value: unknown): _value is RunState => false;

export const isTerminal = (_state: RunState): boolean => false;
