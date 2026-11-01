import { InvalidRunStateError } from "./errors.ts";
import type { Run } from "./run.ts";
import {
  AWAIT_DEPLOY,
  ESCALATE,
  OPEN_PR,
  PREPARE_WORKTREE,
  REQUEST_MERGE,
  RUN_GATES,
  type RunEffect,
  START_DEV,
  START_REVIEW,
  WAIT_CI,
} from "./run-effects.ts";
import { isRunState, type RunState } from "./run-state.ts";

/** Étape à reprendre par état (données) ; `null` pour les états terminaux. */
const RESUME: Readonly<Record<RunState, RunEffect | null>> = {
  leased: PREPARE_WORKTREE,
  developing: START_DEV,
  local_gates: RUN_GATES,
  pr_open: OPEN_PR,
  ci_wait: WAIT_CI,
  reviewing: START_REVIEW,
  merge_requested: REQUEST_MERGE,
  merged: AWAIT_DEPLOY,
  deployed_staging: null,
  blocked: ESCALATE,
  escalated: null,
};

/** Un runner tué repart de l'état persisté (§10.3) : la fonction décide, rien n'est exécuté. */
export const resumePoint = (run: Run): RunEffect | null => {
  if (!isRunState(run.state)) throw new InvalidRunStateError(run.state);
  return RESUME[run.state];
};

/** Incident 17 : faux quand la branche est poussée avec une PR ouverte (lot 2 : à implémenter). */
export const canRestartDevelopment = (_run: Run): boolean => {
  throw new Error("not implemented");
};
