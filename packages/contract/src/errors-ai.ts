import { z } from "zod";

/**
 * Erreurs des appels au modèle (0.9.0). Aucune ne porte de clé, de prompt, de sortie du modèle,
 * de message du fournisseur ni d'identifiant d'organisation : `data` est fermé.
 */
export const llmNotConfiguredError = {
  LLM_NOT_CONFIGURED: {
    status: 409,
    message: "Clé de fournisseur LLM absente, invalidée ou illisible",
    data: z.object({ reason: z.enum(["missing", "invalidated", "undecryptable"]) }),
  },
} as const;

export const llmRateLimitedError = {
  LLM_RATE_LIMITED: {
    status: 429,
    message: "Limite d'appels au modèle atteinte",
    data: z.object({ retryAfterSeconds: z.number().int().min(1) }),
  },
} as const;

export const llmProviderErrorReasonSchema = z.enum([
  "auth",
  "quota",
  "timeout",
  "aborted",
  "budget",
  "context_too_long",
  "refused",
  "model_not_found",
  "unavailable",
]);

export const llmProviderError = {
  LLM_PROVIDER_ERROR: {
    status: 502,
    message: "Le fournisseur du modèle a échoué",
    data: z.object({ reason: llmProviderErrorReasonSchema }),
  },
} as const;

export const llmOutputInvalidError = {
  LLM_OUTPUT_INVALID: { status: 502, message: "Sortie du modèle invalide" },
} as const;

/** Le bloc de rang `rank` contient le délimiteur du prompt : rien n'est envoyé au modèle. */
export const promptRejectedError = {
  PROMPT_REJECTED: {
    status: 422,
    message: "Contenu refusé : il imite le délimiteur du prompt",
    data: z.object({ rank: z.number().int().min(1) }),
  },
} as const;
