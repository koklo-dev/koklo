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

export class DependencyCycleError extends Error {
  readonly path: readonly string[];
  constructor(path: readonly string[]) {
    super(`Cycle de dépendances : ${path.join(" -> ")}`);
    this.name = "DependencyCycleError";
    this.path = path;
  }
}

export class InvalidDependencyTypeError extends Error {
  readonly value: unknown;
  constructor(value: unknown) {
    super(`Type de dépendance inconnu : ${String(value)}`);
    this.name = "InvalidDependencyTypeError";
    this.value = value;
  }
}

/** Titulaire d'un bail ou d'un verrou : membre ou runner. */
export interface LeaseHolderRef {
  readonly kind: "member" | "runner";
  readonly id: string;
}

export interface LeaseRef {
  readonly ticket: string;
  readonly holder: LeaseHolderRef;
  readonly expiresAt: string;
}

export interface LockRef {
  readonly kind: "merge" | "spec-write";
  readonly scope: string;
  readonly holder: LeaseHolderRef;
  readonly expiresAt: string;
}

export class InvalidInstantError extends Error {
  readonly value: unknown;
  constructor(value: unknown) {
    super(`Instant invalide (ISO-8601 UTC attendu) : ${String(value)}`);
    this.name = "InvalidInstantError";
    this.value = value;
  }
}

export class InvalidLeaseError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Bail invalide (${field}) : ${message}`);
    this.name = "InvalidLeaseError";
    this.field = field;
  }
}

export class LeaseAlreadyHeldError<L extends LeaseRef = LeaseRef> extends Error {
  readonly lease: L;
  constructor(lease: L) {
    super(`Ticket ${lease.ticket} déjà sous bail actif (jusqu'à ${lease.expiresAt})`);
    this.name = "LeaseAlreadyHeldError";
    this.lease = lease;
  }
}

export class LeaseExpiredError<L extends LeaseRef = LeaseRef> extends Error {
  readonly lease: L;
  constructor(lease: L) {
    super(`Bail expiré ou libéré pour ${lease.ticket} (expiration ${lease.expiresAt})`);
    this.name = "LeaseExpiredError";
    this.lease = lease;
  }
}

export class LeaseNotHeldByError<L extends LeaseRef = LeaseRef> extends Error {
  readonly lease: L;
  readonly holder: LeaseHolderRef;
  constructor(lease: L, holder: LeaseHolderRef) {
    super(`Le bail de ${lease.ticket} n'appartient pas à ${holder.kind}:${holder.id}`);
    this.name = "LeaseNotHeldByError";
    this.lease = lease;
    this.holder = holder;
  }
}

export class LockAlreadyHeldError<L extends LockRef = LockRef> extends Error {
  readonly lock: L;
  constructor(lock: L) {
    super(`Verrou ${lock.kind}/${lock.scope} déjà tenu (jusqu'à ${lock.expiresAt})`);
    this.name = "LockAlreadyHeldError";
    this.lock = lock;
  }
}

export class NestedLockError<L extends LockRef = LockRef> extends Error {
  readonly holder: LeaseHolderRef;
  readonly held: L;
  readonly requested: { readonly kind: string; readonly scope: string };
  constructor(holder: LeaseHolderRef, held: L, requested: { kind: string; scope: string }) {
    super(
      `Verrou imbriqué refusé : ${held.kind}/${held.scope} tenu, ${requested.kind}/${requested.scope} demandé`,
    );
    this.name = "NestedLockError";
    this.holder = holder;
    this.held = held;
    this.requested = requested;
  }
}

export class LockNotHeldByError extends Error {
  readonly kind: string;
  readonly scope: string;
  readonly holder: LeaseHolderRef;
  constructor(kind: string, scope: string, holder: LeaseHolderRef) {
    super(`Verrou ${kind}/${scope} non tenu par ${holder.kind}:${holder.id}`);
    this.name = "LockNotHeldByError";
    this.kind = kind;
    this.scope = scope;
    this.holder = holder;
  }
}

export class StaleProjectStateError<
  S extends { readonly version: number } = { readonly version: number; readonly content: unknown },
> extends Error {
  readonly current: S;
  readonly expected: number;
  constructor(current: S, expected: number) {
    super(`État de projet périmé : version attendue ${expected}`);
    this.name = "StaleProjectStateError";
    this.current = current;
    this.expected = expected;
  }
}

export class InvalidProjectStateVersionError extends Error {
  readonly value: unknown;
  constructor(value: unknown) {
    super(`Version d'état de projet invalide : ${String(value)}`);
    this.name = "InvalidProjectStateVersionError";
    this.value = value;
  }
}
