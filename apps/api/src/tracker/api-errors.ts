import {
  CounterLimitReachedError,
  DependencyCycleError,
  InvalidLeaseError,
  InvalidProjectStateVersionError,
  InvalidSensitivityError,
  InvalidTicketError,
  InvalidTicketTransitionError,
  LeaseAlreadyHeldError,
  LeaseExpiredError,
  LeaseNotHeldByError,
  StaleProjectStateError,
  TicketPackageError,
} from "@koklo/domain";
import { ORPCError } from "@orpc/server";

type ConflictReason =
  | "sprint_already_active"
  | "sprint_not_planned"
  | "sprint_not_active"
  | "ticket_has_active_lease"
  | "counter_limit_reached";

export const notFound = () => new ORPCError("NOT_FOUND", { message: "Ressource introuvable" });
/** Une ressource absente ou hors du projet est `NOT_FOUND` (aucune fuite entre projets). */
export function orNotFound<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw notFound();
  }
  return value;
}

export const conflict = (reason: ConflictReason) => new ORPCError("CONFLICT", { data: { reason } });
export const invalidTransition = (from: string, to: string) =>
  new ORPCError("INVALID_TRANSITION", { data: { from, to } });
export const validation = (field: string, message: string) =>
  new ORPCError("VALIDATION", { data: { field, message } });

/**
 * Traduit une erreur nommée du domaine vers l'erreur typée du contrat (H1) : aucune erreur de
 * domaine ne sort telle quelle. Une erreur inconnue est relancée (elle deviendra `INTERNAL`).
 */
export function toApiError(error: unknown): unknown {
  if (error instanceof InvalidTicketError) return validation(error.field, error.message);
  if (error instanceof TicketPackageError) return validation("pkg", error.message);
  if (error instanceof InvalidSensitivityError) return validation("sensitivity", error.message);
  if (error instanceof CounterLimitReachedError) return conflict("counter_limit_reached");
  if (error instanceof InvalidTicketTransitionError) {
    return invalidTransition(String(error.from), String(error.to));
  }
  if (error instanceof DependencyCycleError) {
    return new ORPCError("DEPENDENCY_CYCLE", { data: { path: error.path } });
  }
  return leaseOrStateError(error);
}

/** Erreurs nommées des baux et de l'état de projet (CDC §7.4, §7.5) vers leurs erreurs typées. */
function leaseOrStateError(error: unknown): unknown {
  if (error instanceof InvalidLeaseError) return validation(error.field, error.message);
  if (error instanceof InvalidProjectStateVersionError) {
    return validation("expectedVersion", error.message);
  }
  if (error instanceof LeaseAlreadyHeldError) {
    const { ticket, holder, expiresAt } = error.lease;
    return new ORPCError("LEASE_HELD", { data: { ticket, holder, expiresAt } });
  }
  if (error instanceof LeaseNotHeldByError) {
    const { ticket, holder } = error.lease;
    return new ORPCError("LEASE_NOT_HOLDER", { data: { ticket, holder } });
  }
  if (error instanceof LeaseExpiredError) {
    const { ticket, expiresAt } = error.lease;
    return new ORPCError("LEASE_EXPIRED", { data: { ticket, expiresAt } });
  }
  if (error instanceof StaleProjectStateError) {
    const { expected, current } = error;
    return new ORPCError("VERSION_CONFLICT", { data: { expected, current } });
  }
  return error;
}

/** Exécute un appel au domaine en traduisant ses erreurs nommées. */
export function viaDomain<T>(call: () => T): T {
  try {
    return call();
  } catch (error) {
    throw toApiError(error);
  }
}

/** Violation d'unicité Prisma (P2002) : index partiels « un seul sprint actif » et « un seul bail actif ». */
export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
