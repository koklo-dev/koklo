/** SQUELETTE (TK-72 lot 1, étape RED) : classes déclarées, constructeurs sans effet. */
import type { RunState } from "./run-state.ts";

export class InvalidRunStateError extends Error {
  declare readonly value: unknown;
  constructor(_value: unknown) {
    super("not implemented");
  }
}

export class InvalidRunEventError extends Error {
  declare readonly reason: string;
  constructor(_reason: string) {
    super("not implemented");
  }
}

export class InvalidRunTransitionError extends Error {
  declare readonly from: RunState;
  declare readonly event: string;
  constructor(_from: RunState, _event: string) {
    super("not implemented");
  }
}

export class StaleRunError extends Error {
  declare readonly expectedVersion: number;
  declare readonly actualVersion: number;
  constructor(_expectedVersion: number, _actualVersion: number) {
    super("not implemented");
  }
}
