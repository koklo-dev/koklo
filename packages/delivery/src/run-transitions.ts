import { type BlockInfo, cloneBlock } from "./block-cause.ts";
import { InvalidRunStateError, InvalidRunTransitionError, StaleRunError } from "./errors.ts";
import type { Run, RunLimits } from "./run.ts";
import { applyCounters, checkLimits } from "./run-counters.ts";
import {
  AWAIT_DEPLOY,
  ESCALATE,
  notify,
  OPEN_PR,
  REQUEST_MERGE,
  RUN_GATES,
  type RunEffect,
  START_DEV,
  START_REVIEW,
  WAIT_CI,
} from "./run-effects.ts";
import type { RunEvent, RunEventType } from "./run-event.ts";
import { blockOf, checkEvent } from "./run-event-check.ts";
import { assertRestartable } from "./run-resume.ts";
import { isRunState, type RunState } from "./run-state.ts";

export interface RunStep {
  readonly run: Run;
  readonly effects: readonly RunEffect[];
}

/** Une transition : état d'arrivée et effets décrits ; `neutral` = événement sans effet sur le run. */
interface Transition {
  readonly to: RunState;
  readonly effects: readonly RunEffect[];
  readonly neutral?: true;
  /** Rejeu idempotent : le run est déjà dans l'état d'arrivée ; no-op, sans contrôle de version. */
  readonly replay?: true;
}

const replay = (to: RunState): Transition => ({ to, effects: [], neutral: true, replay: true });

const go = (to: RunState, ...effects: RunEffect[]): Transition => ({ to, effects });

/** Tout état actif accepte `block` (-> blocked) et `quota_hit` (neutre, D2). */
const active = (state: RunState, moves: Partial<Record<RunEventType, Transition>>) => ({
  ...moves,
  block: go("blocked"),
  quota_hit: { to: state, effects: [], neutral: true } as const,
});

/** Table de transitions (vision §C.6) : des données, pas de logique. Absent = interdit. */
const TABLE: Readonly<Record<RunState, Partial<Record<RunEventType, Transition>>>> = {
  leased: active("leased", { worktree_ready: go("developing", START_DEV) }),
  developing: active("developing", { dev_done: go("local_gates", RUN_GATES) }),
  local_gates: active("local_gates", {
    gates_green: go("pr_open", OPEN_PR),
    gates_red: go("developing", START_DEV),
  }),
  pr_open: active("pr_open", { pr_opened: go("ci_wait", WAIT_CI) }),
  ci_wait: active("ci_wait", {
    ci_green: go("reviewing", START_REVIEW),
    ci_red: go("developing", START_DEV),
    ci_timeout: go("ci_wait", WAIT_CI),
    conflict_detected: go("developing", START_DEV),
  }),
  reviewing: active("reviewing", {
    verdict_approve: go("merge_requested", REQUEST_MERGE),
    verdict_request_changes: go("developing", START_DEV),
  }),
  merge_requested: active("merge_requested", { merge_done: go("merged", AWAIT_DEPLOY) }),
  merged: active("merged", { deploy_green: go("deployed_staging"), merge_done: replay("merged") }),
  deployed_staging: { deploy_green: replay("deployed_staging") },
  blocked: { escalate: go("escalated", ESCALATE) },
  escalated: { escalate: replay("escalated") },
};

export const canApply = (state: unknown, event: unknown): boolean =>
  isRunState(state) && typeof event === "string" && Object.hasOwn(TABLE[state], event);

export const allowedEvents = (state: RunState): readonly RunEventType[] =>
  Object.keys(TABLE[state]) as RunEventType[];

/** Champs du run modifiés par un événement porteur de données. */
const patchOf = (event: RunEvent): Partial<Run> => {
  if (event.type === "worktree_ready") return { branch: event.branch };
  if (event.type === "pr_opened") return { pullRequest: event.pullRequest };
  return {};
};

const withNotify = (transition: Transition, block: BlockInfo | null): readonly RunEffect[] =>
  block === null ? transition.effects : [notify(block.cause)];

/**
 * Applique un événement : pure, déterministe, renvoie un nouveau run gelé et les effets décrits.
 * Ordre des contrôles : état inconnu, événement mal formé, limites invalides, rejeu idempotent,
 * version périmée, transition absente, plafonds.
 */
export const applyEvent = (run: Run, input: RunEvent, limits: RunLimits): RunStep => {
  if (!isRunState(run.state)) throw new InvalidRunStateError(run.state);
  const event = checkEvent(input);
  const checked = checkLimits(limits);
  const transition = TABLE[run.state][event.type];
  if (transition?.replay) return Object.freeze({ run, effects: transition.effects });
  if (event.expectedVersion !== undefined && event.expectedVersion !== run.version) {
    throw new StaleRunError(event.expectedVersion, run.version);
  }
  if (transition === undefined) throw new InvalidRunTransitionError(run.state, event.type);
  if (event.type === "worktree_ready") assertRestartable(run);
  if (transition.neutral) return Object.freeze({ run, effects: transition.effects });
  const counted = applyCounters(run, event, checked);
  const block = blockOf(event) ?? counted.block;
  const next: Run = Object.freeze({
    ...run,
    ...patchOf(event),
    ...counted.patch,
    blocked: block ?? (run.blocked && cloneBlock(run.blocked)),
    state: block === null ? transition.to : "blocked",
    version: run.version + 1,
  });
  return Object.freeze({ run: next, effects: Object.freeze(withNotify(transition, block)) });
};
