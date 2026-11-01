/** SQUELETTE (TK-72 lot 1, étape RED). */
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

export const startRun = (_input: StartRunInput): Run => {
  throw new Error("not implemented");
};
