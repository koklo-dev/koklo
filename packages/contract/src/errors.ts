import { z } from "zod";

const requestIdData = z.object({ requestId: z.string() });

/** Erreurs typées partagées : le contrat les déclare, chaque route choisit celles qu'elle expose. */
export const internalError = {
  INTERNAL: { status: 500, message: "Erreur interne", data: requestIdData },
} as const;

export const authErrors = {
  UNAUTHORIZED: { status: 401, message: "Session absente ou expirée" },
  FORBIDDEN: { status: 403, message: "Accès refusé" },
} as const;
