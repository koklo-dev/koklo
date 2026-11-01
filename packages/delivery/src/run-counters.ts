/** Compteurs et plafonds du run : fonctions pures, les plafonds viennent de `RunLimits` (jamais codés ici). */
import { type BlockInfo, createBlock } from "./block-cause.ts";
import { InvalidRunEventError } from "./errors.ts";
import type { Run, RunLimits } from "./run.ts";
import type { RunEvent } from "./run-event.ts";
import { isCount } from "./value-check.ts";

/** Effet d'un événement sur les compteurs : champs modifiés, ou blocage quand un plafond est atteint. */
export interface CounterOutcome {
  readonly patch: Partial<Run>;
  readonly block: BlockInfo | null;
}

const LIMIT_KEYS = ["maxAttempts", "maxReviewRounds", "maxCiWaits"] as const;

/** Plafonds : trois entiers >= 0, contrôlés pour tout événement. */
export const checkLimits = (limits: unknown): RunLimits => {
  const record = (limits ?? {}) as Record<string, unknown>;
  if (!LIMIT_KEYS.every((key) => isCount(record[key]))) {
    throw new InvalidRunEventError("limites de run invalides");
  }
  return limits as RunLimits;
};

const proceed = (patch: Partial<Run>): CounterOutcome => ({ patch, block: null });

const stop = (
  cause: "ci_failed" | "review_exhausted" | "ci_timeout",
  counter: string,
  used: number,
  max: number,
) => ({
  patch: {},
  block: createBlock(cause, `plafond atteint : ${counter} ${used}/${max}`),
});

const countAttempt = (run: Run, limits: RunLimits): CounterOutcome =>
  run.attempts >= limits.maxAttempts
    ? stop("ci_failed", "tentatives", run.attempts, limits.maxAttempts)
    : proceed({ attempts: run.attempts + 1 });

const countReviewRound = (run: Run, limits: RunLimits): CounterOutcome =>
  run.reviewRounds >= limits.maxReviewRounds
    ? stop("review_exhausted", "rounds de review", run.reviewRounds, limits.maxReviewRounds)
    : proceed({ reviewRounds: run.reviewRounds + 1, lastReviewedAfterFix: false });

const countCiWait = (run: Run, limits: RunLimits): CounterOutcome =>
  run.ciWaits >= limits.maxCiWaits
    ? stop("ci_timeout", "attentes de CI", run.ciWaits, limits.maxCiWaits)
    : proceed({ ciWaits: run.ciWaits + 1 });

/** Au plafond de rounds, la relecture qui suit est celle du dernier correctif (incident 13). */
const enterReview = (run: Run, limits: RunLimits): CounterOutcome =>
  proceed({ lastReviewedAfterFix: run.reviewRounds >= limits.maxReviewRounds });

const RESET: Partial<Run> = { attempts: 0, reviewRounds: 0, ciWaits: 0 };

/** Compteurs touchés par un événement ; tout événement hors de cette liste ne touche rien. */
export const applyCounters = (run: Run, event: RunEvent, limits: RunLimits): CounterOutcome => {
  switch (event.type) {
    case "gates_red":
    case "ci_red":
      return countAttempt(run, limits);
    case "verdict_request_changes":
      return countReviewRound(run, limits);
    case "ci_timeout":
      return countCiWait(run, limits);
    case "ci_green":
      return enterReview(run, limits);
    case "escalate":
      return proceed(RESET);
    default:
      return proceed({});
  }
};
