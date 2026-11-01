import { llmCallErrors } from "./contract-ai.ts";
import { encryptionUnavailableError, notFoundError, validationError } from "./errors.ts";
import { route, writeErrors } from "./route-helpers.ts";
import { llmCredentialVerifyOutputSchema } from "./schemas-ai.ts";
import {
  llmCredentialListOutputSchema,
  llmCredentialProviderInputSchema,
  llmCredentialRemoveOutputSchema,
  llmCredentialSetInputSchema,
  llmCredentialStatusSchema,
} from "./schemas-llm-credential.ts";

const PATH = "/llm-credentials/{provider}";
const providerErrors = { ...writeErrors, ...notFoundError, ...validationError } as const;

/**
 * Clés BYOK d'une organisation (CDC §14 : owner et admin, `list` compris). `list` ne déchiffre
 * rien : ni 503 ni 422. Le 503 de `set` signale l'absence de porte-clés.
 */
export const llmCredential = {
  list: route("GET", "/llm-credentials").errors(writeErrors).output(llmCredentialListOutputSchema),
  set: route("PUT", PATH)
    .errors({ ...writeErrors, ...validationError, ...encryptionUnavailableError })
    .input(llmCredentialSetInputSchema)
    .output(llmCredentialStatusSchema),
  remove: route("DELETE", PATH)
    .errors(providerErrors)
    .input(llmCredentialProviderInputSchema)
    .output(llmCredentialRemoveOutputSchema),
  invalidate: route("POST", `${PATH}/invalidate`)
    .errors(providerErrors)
    .input(llmCredentialProviderInputSchema)
    .output(llmCredentialStatusSchema),
  /** Appel minimal au fournisseur (16 tokens) : la clé fonctionne-t-elle ? Audité, comptée au quota. */
  verify: route("POST", `${PATH}/verify`)
    .errors(llmCallErrors)
    .input(llmCredentialProviderInputSchema)
    .output(llmCredentialVerifyOutputSchema),
};
