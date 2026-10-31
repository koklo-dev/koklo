import {
  GitAuthExpiredError,
  GitConflictError,
  GitNotFoundError,
  GitProviderUnavailableError,
  GitRateLimitedError,
  type SpecBatchErrorCode,
} from "@koklo/domain";
import { conflicted, failed, type Outcome } from "./types.ts";

/** Classement d'une panne : résultat métier à écrire, ou panne transitoire à relancer. */
export type Failure = { readonly outcome: Outcome } | { readonly retry: SpecBatchErrorCode };

/**
 * `instanceof` (le `name` d'une erreur est énumérable donc falsifiable) ; rien du message du
 * fournisseur n'est conservé. Autorisation expirée, branche disparue, tête toujours périmée : le
 * résultat est métier, le job termine. Indisponibilité, limite de débit, base ou bogue : transitoire.
 */
export function classify(error: unknown): Failure {
  if (error instanceof GitAuthExpiredError) {
    return { outcome: failed("PROVIDER_AUTH_EXPIRED") };
  }
  if (error instanceof GitNotFoundError || error instanceof GitConflictError) {
    return { outcome: conflicted("write_conflict") };
  }
  if (error instanceof GitProviderUnavailableError) return { retry: "PROVIDER_UNAVAILABLE" };
  if (error instanceof GitRateLimitedError) return { retry: "PROVIDER_RATE_LIMITED" };
  return { retry: "INTERNAL" };
}
