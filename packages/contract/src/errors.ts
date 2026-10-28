import { z } from "zod";

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
]);

export const conflictError = {
  CONFLICT: {
    status: 409,
    message: "Conflit avec l'état actuel",
    data: z.object({ reason: conflictReasonSchema }),
  },
} as const;
