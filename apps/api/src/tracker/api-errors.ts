import {
  CounterLimitReachedError,
  DependencyCycleError,
  InvalidSensitivityError,
  InvalidTicketError,
  InvalidTicketTransitionError,
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

/** Violation d'unicité Prisma (P2002) : l'index partiel « un seul sprint actif » en est la source. */
export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
