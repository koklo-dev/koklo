/** Valeur immuable et sérialisable en JSON : l'état d'un run de livraison. */
import type { BlockInfo } from "./block-cause.ts";
import { InvalidRunEventError } from "./errors.ts";
import type { RunState } from "./run-state.ts";
import { isCount, isText } from "./value-check.ts";

export interface Run {
  readonly ticket: string;
  readonly state: RunState;
  readonly attempts: number;
  readonly reviewRounds: number;
  readonly ciWaits: number;
  readonly blocked: BlockInfo | null;
  readonly branch: string | null;
  readonly pullRequest: string | null;
  readonly lastReviewedAfterFix: boolean;
  readonly version: number;
}

export interface StartRunInput {
  readonly ticket: string;
  readonly attempts?: number;
  readonly reviewRounds?: number;
  /** Branche déjà poussée et PR ouverte (portées par le ticket) : le run reprend, il ne repart pas. */
  readonly branch?: string | null;
  readonly pullRequest?: string | null;
}

export interface RunLimits {
  readonly maxAttempts: number;
  readonly maxReviewRounds: number;
  readonly maxCiWaits: number;
}

/** Branche poussée et PR ouverte : le run se reprend à l'attente de CI, il ne repart pas (incident 17). */
const hasPushedPullRequest = (input: StartRunInput): boolean =>
  (input.branch ?? null) !== null && (input.pullRequest ?? null) !== null;

const checkOptionalText = (value: unknown, reason: string): void => {
  if (value !== undefined && value !== null && !isText(value))
    throw new InvalidRunEventError(reason);
};

/** Entrée de `startRun` : mêmes règles que les plafonds (entiers >= 0) et des chaînes non vides. */
const checkStartInput = (input: StartRunInput): void => {
  if (!isText(input?.ticket)) throw new InvalidRunEventError("ticket obligatoire");
  for (const count of [input.attempts, input.reviewRounds]) {
    if (count !== undefined && !isCount(count)) throw new InvalidRunEventError("compteur invalide");
  }
  checkOptionalText(input.branch, "branche invalide");
  checkOptionalText(input.pullRequest, "pull request invalide");
};

/** Crée un run `leased`, version 0 (ou `ci_wait` si la PR existe) ; les compteurs viennent du ticket (D7). */
export const startRun = (input: StartRunInput): Run => {
  checkStartInput(input);
  return Object.freeze({
    ticket: input.ticket,
    state: hasPushedPullRequest(input) ? "ci_wait" : "leased",
    attempts: input.attempts ?? 0,
    reviewRounds: input.reviewRounds ?? 0,
    ciWaits: 0,
    blocked: null,
    branch: input.branch ?? null,
    pullRequest: input.pullRequest ?? null,
    lastReviewedAfterFix: false,
    version: 0,
  });
};
