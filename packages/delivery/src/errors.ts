/** Erreurs typées nommées de la machine du run : aucune donnée d'événement dans les messages. */
import type { RunState } from "./run-state.ts";

export class InvalidRunStateError extends Error {
  readonly value: unknown;
  constructor(value: unknown) {
    super(`État de run inconnu : ${String(value)}`);
    this.name = "InvalidRunStateError";
    this.value = value;
  }
}

export class InvalidRunEventError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`Événement de run invalide : ${reason}`);
    this.name = "InvalidRunEventError";
    this.reason = reason;
  }
}

export class InvalidRunTransitionError extends Error {
  readonly from: RunState;
  readonly event: string;
  constructor(from: RunState, event: string) {
    super(`Transition de run interdite : ${from} + ${event}`);
    this.name = "InvalidRunTransitionError";
    this.from = from;
    this.event = event;
  }
}

export class StaleRunError extends Error {
  readonly expectedVersion: number;
  readonly actualVersion: number;
  constructor(expectedVersion: number, actualVersion: number) {
    super(`Run périmé : version attendue ${expectedVersion}, version courante ${actualVersion}`);
    this.name = "StaleRunError";
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}
