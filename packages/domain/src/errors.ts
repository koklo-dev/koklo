/** Erreurs typées nommées du domaine (CDC §17.1 : pas d'exception générique). */

export class InvalidTicketTransitionError extends Error {
  readonly from: unknown;
  readonly to: unknown;
  constructor(from: unknown, to: unknown) {
    super(`Transition de ticket interdite : ${String(from)} -> ${String(to)}`);
    this.name = "InvalidTicketTransitionError";
    this.from = from;
    this.to = to;
  }
}

export class InvalidTicketStatusError extends Error {
  readonly value: unknown;
  constructor(value: unknown) {
    super(`Statut de ticket inconnu : ${String(value)}`);
    this.name = "InvalidTicketStatusError";
    this.value = value;
  }
}

export class InvalidTicketKeyError extends Error {
  readonly value: unknown;
  constructor(value: unknown) {
    super(`Clé de ticket invalide : ${String(value)}`);
    this.name = "InvalidTicketKeyError";
    this.value = value;
  }
}

export class DuplicateTicketKeyError extends Error {
  readonly key: string;
  constructor(key: string) {
    super(`Clé de ticket en double : ${key}`);
    this.name = "DuplicateTicketKeyError";
    this.key = key;
  }
}

export type TicketPackageErrorReason = "none" | "multiple" | "unknown";

export class TicketPackageError extends Error {
  readonly reason: TicketPackageErrorReason;
  readonly value: unknown;
  constructor(reason: TicketPackageErrorReason, value: unknown) {
    super(`Paquet de ticket invalide (${reason}) : ${JSON.stringify(value) ?? "undefined"}`);
    this.name = "TicketPackageError";
    this.reason = reason;
    this.value = value;
  }
}

export class InvalidSensitivityError extends Error {
  readonly value: unknown;
  constructor(value: unknown) {
    super(`Sensibilité invalide : ${String(value)}`);
    this.name = "InvalidSensitivityError";
    this.value = value;
  }
}

export type TicketCounterName = "attempts" | "reviewRounds";

export class CounterLimitReachedError extends Error {
  readonly counter: TicketCounterName;
  readonly max: number;
  constructor(counter: TicketCounterName, max: number) {
    super(`Plafond atteint pour ${counter} : ${max}`);
    this.name = "CounterLimitReachedError";
    this.counter = counter;
    this.max = max;
  }
}

export class InvalidTicketError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Ticket invalide (${field}) : ${message}`);
    this.name = "InvalidTicketError";
    this.field = field;
  }
}
