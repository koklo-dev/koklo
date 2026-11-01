import { isOneOf } from "./one-of.ts";

/** États du run (vision §10.3, annexe C §C.6), dans l'ordre de la vision. */
export const RUN_STATES = [
  "leased",
  "developing",
  "local_gates",
  "pr_open",
  "ci_wait",
  "reviewing",
  "merge_requested",
  "merged",
  "deployed_staging",
  "blocked",
  "escalated",
] as const;

export type RunState = (typeof RUN_STATES)[number];

/** Seuls ces états n'acceptent plus aucun événement (`merged` et `blocked` ne le sont pas). */
const TERMINAL_STATES: readonly RunState[] = ["deployed_staging", "escalated"];

export const isRunState = (value: unknown): value is RunState => isOneOf(RUN_STATES, value);

export const isTerminal = (state: RunState): boolean => TERMINAL_STATES.includes(state);
