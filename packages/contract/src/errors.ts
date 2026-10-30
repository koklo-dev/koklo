import { z } from "zod";
import { projectStateSchema } from "./schemas-collaboration.ts";
import {
  holderSchema,
  instantSchema,
  ticketKeySchema,
  ticketStatusSchema,
} from "./schemas-tickets.ts";

const requestIdData = z.object({ requestId: z.string() });

/** Erreurs typées partagées : le contrat les déclare, chaque route choisit celles qu'elle expose. */
export const internalError = {
  INTERNAL: { status: 500, message: "Erreur interne", data: requestIdData },
} as const;

export const unauthorizedError = {
  UNAUTHORIZED: { status: 401, message: "Session absente ou expirée" },
} as const;

export const forbiddenError = {
  FORBIDDEN: { status: 403, message: "Accès refusé" },
} as const;

export const authErrors = { ...unauthorizedError, ...forbiddenError } as const;

export const notFoundError = {
  NOT_FOUND: { status: 404, message: "Ressource introuvable" },
} as const;

export const conflictReasonSchema = z.enum([
  "slug_taken",
  "already_member",
  "already_invited",
  "last_owner",
  "sprint_already_active",
  "sprint_not_planned",
  "sprint_not_active",
  "ticket_has_active_lease",
  "counter_limit_reached",
  "spec_repo_exists",
  "repo_already_linked",
  "repo_name_taken",
]);

export const conflictError = {
  CONFLICT: {
    status: 409,
    message: "Conflit avec l'état actuel",
    data: z.object({ reason: conflictReasonSchema }),
  },
} as const;

/** Transition refusée par la table du cycle de vie d'un ticket (`InvalidTicketTransitionError`). */
export const invalidTransitionError = {
  INVALID_TRANSITION: {
    status: 409,
    message: "Transition de statut interdite",
    data: z.object({ from: ticketStatusSchema, to: ticketStatusSchema }),
  },
} as const;

/** Arête refusée parce qu'elle fermerait un cycle (`DependencyCycleError`). */
export const dependencyCycleError = {
  DEPENDENCY_CYCLE: {
    status: 409,
    message: "La dépendance créerait un cycle",
    data: z.object({ path: z.array(ticketKeySchema) }),
  },
} as const;

/** Écriture optimiste refusée avec l'état courant (`StaleProjectStateError`, CDC §7.4). */
export const versionConflictError = {
  VERSION_CONFLICT: {
    status: 409,
    message: "Version de l'état de projet périmée",
    data: z.object({ expected: z.number().int(), current: projectStateSchema }),
  },
} as const;

/** Bail déjà détenu par un autre titulaire (`LeaseAlreadyHeldError`). */
export const leaseHeldError = {
  LEASE_HELD: {
    status: 409,
    message: "Ticket déjà réservé par un bail actif",
    data: z.object({ ticket: ticketKeySchema, holder: holderSchema, expiresAt: instantSchema }),
  },
} as const;

/** Bail expiré, à ré-acquérir (`LeaseExpiredError`). */
export const leaseExpiredError = {
  LEASE_EXPIRED: {
    status: 409,
    message: "Bail expiré",
    data: z.object({ ticket: ticketKeySchema, expiresAt: instantSchema }),
  },
} as const;

/** L'appelant n'est pas le titulaire du bail (`LeaseNotHeldByError`) ; `holder` est le titulaire réel. */
export const leaseNotHolderError = {
  LEASE_NOT_HOLDER: {
    status: 403,
    message: "L'appelant n'est pas le titulaire du bail",
    data: z.object({ ticket: ticketKeySchema, holder: holderSchema }),
  },
} as const;

/** Entrée sémantiquement invalide (`InvalidTicketError`, `TicketPackageError`, `InvalidSensitivityError`). */
export const validationError = {
  VALIDATION: {
    status: 422,
    message: "Entrée invalide",
    data: z.object({ field: z.string(), message: z.string() }),
  },
} as const;

export * from "./errors-provider.ts";
