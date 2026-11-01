/** Valeur immuable et sérialisable en JSON : l'état d'un run de livraison. */
import type { BlockInfo } from "./block-cause.ts";
import type { RunState } from "./run-state.ts";

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
}

export interface RunLimits {
  readonly maxAttempts: number;
  readonly maxReviewRounds: number;
  readonly maxCiWaits: number;
}

/** Crée un run `leased`, version 0 ; les compteurs viennent du ticket, qui reste la source (D7). */
export const startRun = (input: StartRunInput): Run =>
  Object.freeze({
    ticket: input.ticket,
    state: "leased",
    attempts: input.attempts ?? 0,
    reviewRounds: input.reviewRounds ?? 0,
    ciWaits: 0,
    blocked: null,
    branch: null,
    pullRequest: null,
    lastReviewedAfterFix: false,
    version: 0,
  });
