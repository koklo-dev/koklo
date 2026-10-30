import { z } from "zod";
import { ownerKindSchema } from "./schemas-provider.ts";
import { validationReportSchema } from "./schemas-spec.ts";

/**
 * Erreurs du fournisseur git et des lots d'écriture (0.5.0). Aucune ne porte de jeton, de message
 * brut du fournisseur ni de corps de réponse.
 */

/** `RepoCreationForbiddenError` du domaine ; les `reason` reprennent ses littéraux. */
export const repoCreationForbiddenError = {
  REPO_CREATION_FORBIDDEN: {
    status: 403,
    message: "Création du dépôt refusée par le fournisseur",
    data: z.object({
      reason: z.enum(["missing-user-token", "resource-not-accessible"]),
      ownerLogin: z.string().min(1),
      ownerKind: ownerKindSchema,
    }),
  },
} as const;

/** `UserTokenRequiredError` : le web enchaîne sur `installation.start` avec l'installation. */
export const userTokenRequiredError = {
  USER_TOKEN_REQUIRED: {
    status: 403,
    message: "Autorisation de l'utilisateur chez le fournisseur requise",
    data: z.object({ ownerLogin: z.string().min(1) }),
  },
} as const;

/** `GitAuthExpiredError` : 403 et non 401, pour ne pas la confondre avec une session Koklo absente. */
export const providerAuthExpiredError = {
  PROVIDER_AUTH_EXPIRED: {
    status: 403,
    message: "Autorisation du fournisseur expirée",
    data: z.object({ kind: z.enum(["installation", "user"]), refreshable: z.boolean() }),
  },
} as const;

/** `GitRateLimitedError`. */
export const providerRateLimitedError = {
  PROVIDER_RATE_LIMITED: {
    status: 429,
    message: "Limite de débit du fournisseur atteinte",
    data: z.object({ retryAfterMs: z.number().optional() }),
  },
} as const;

/** `GitProviderUnavailableError`. */
export const providerUnavailableError = {
  PROVIDER_UNAVAILABLE: { status: 503, message: "Fournisseur indisponible" },
} as const;

export const providerErrors = {
  ...providerAuthExpiredError,
  ...providerRateLimitedError,
  ...providerUnavailableError,
} as const;

/** Lot refusé : clé d'idempotence réutilisée, base périmée ou écriture concurrente. */
export const specBatchConflictError = {
  SPEC_BATCH_CONFLICT: {
    status: 409,
    message: "Conflit sur le lot d'écriture de la spec",
    data: z.object({
      reason: z.enum(["idempotency_key_reused", "stale_base", "write_conflict"]),
      batchId: z.uuid().optional(),
    }),
  },
} as const;

/** Le lot produirait une spec avec des erreurs bloquantes (rapport plafonné). */
export const specInvalidError = {
  SPEC_INVALID: {
    status: 422,
    message: "La spec résultante est invalide",
    data: z.object({ report: validationReportSchema }),
  },
} as const;
