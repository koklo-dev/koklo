/** Erreurs typées nommées de la machine du run : aucune donnée d'événement dans les messages. */
import type { RunState } from "./run-state.ts";

const MAX_SHOWN = 32;

export class InvalidRunStateError extends Error {
  /** Chaîne bornée : jamais l'objet persisté brut ni une longue chaîne arbitraire. */
  readonly value: string;
  constructor(value: unknown) {
    const shown = typeof value === "string" ? value.slice(0, MAX_SHOWN) : typeof value;
    super(`État de run inconnu : ${shown}`);
    this.name = "InvalidRunStateError";
    this.value = shown;
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

/** Incident 17 : une branche poussée avec PR ouverte se reprend, elle ne repart jamais de zéro. */
export class ResumeRequiredError extends Error {
  readonly ticket: string;
  readonly branch: string;
  readonly pullRequest: string;
  constructor(ticket: string, branch: string, pullRequest: string) {
    super(`Reprise obligatoire : ${ticket} a la branche ${branch} et la PR ${pullRequest}`);
    this.name = "ResumeRequiredError";
    this.ticket = ticket;
    this.branch = branch;
    this.pullRequest = pullRequest;
  }
}
