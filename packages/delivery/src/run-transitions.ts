/** SQUELETTE (TK-72 lot 1, étape RED). */

import type { Run, RunLimits } from "./run.ts";
import type { RunEffect } from "./run-effects.ts";
import type { RunEvent, RunEventType } from "./run-event.ts";
import type { RunState } from "./run-state.ts";

export interface RunStep {
  readonly run: Run;
  readonly effects: readonly RunEffect[];
}

export const canApply = (_state: unknown, _event: unknown): boolean => false;

export const allowedEvents = (_state: RunState): readonly RunEventType[] => [];

export const applyEvent = (_run: Run, _event: RunEvent, _limits: RunLimits): RunStep => {
  throw new Error("not implemented");
};
