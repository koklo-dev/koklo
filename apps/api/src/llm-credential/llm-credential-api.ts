import type { LlmCredentialStatusOutput } from "@koklo/contract";
import { ORPCError } from "@orpc/server";
import { notFound, validation } from "../tracker/api-errors.ts";
import type { LlmCredentialStatus } from "./llm-credential.repository.ts";
import { EncryptionUnavailableError, LlmCredentialInputError } from "./llm-credential-errors.ts";

/** Statut du contrat : les valeurs `null` du dépôt deviennent des clés absentes ; pas d'`id`. */
export function toStatusOutput(status: LlmCredentialStatus): LlmCredentialStatusOutput {
  return {
    provider: status.provider,
    ...(status.defaultModel === null ? {} : { defaultModel: status.defaultModel }),
    configured: true,
    invalid: status.invalid,
    ...(status.invalidatedAt === null ? {} : { invalidatedAt: status.invalidatedAt }),
    ...(status.lastUsedAt === null ? {} : { lastUsedAt: status.lastUsedAt }),
    createdAt: status.createdAt,
    updatedAt: status.updatedAt,
  };
}

/** Une clé absente (ou d'une autre organisation) est `NOT_FOUND`, sans distinction. */
export function orKeyNotFound<T>(value: T | null | false): T {
  if (value === null || value === false) throw notFound();
  return value;
}

/**
 * Erreurs nommées du service vers les erreurs typées du contrat. La raison ne reprend jamais la
 * valeur saisie ; toute autre erreur est relancée (elle deviendra `INTERNAL`).
 */
export async function viaCredential<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof LlmCredentialInputError) throw validation(error.field, error.reason);
    if (error instanceof EncryptionUnavailableError) {
      throw new ORPCError("ENCRYPTION_UNAVAILABLE", { message: "Chiffrement indisponible" });
    }
    throw error;
  }
}
