import {
  GitAuthExpiredError,
  GitNotFoundError,
  GitProviderUnavailableError,
  GitRateLimitedError,
  type WebhookDeliveryErrorCode,
} from "@koklo/domain";
import { TransientJobError } from "../job-support.ts";
import { type DeliveryOutcome, failedWith } from "./types.ts";

/** Classement d'une panne : résultat métier à écrire, ou panne transitoire à relancer. */
export type Failure =
  | { readonly outcome: DeliveryOutcome }
  | { readonly retry: WebhookDeliveryErrorCode };

export class WebhookTransientError extends TransientJobError<WebhookDeliveryErrorCode> {
  constructor(code: WebhookDeliveryErrorCode) {
    super("webhook-delivery", code);
    this.name = "WebhookTransientError";
  }
}

/**
 * `instanceof` (le `name` d'une erreur est énumérable donc falsifiable) ; rien du message du
 * fournisseur n'est conservé. Dépôt introuvable : résultat métier. Indisponibilité, quota,
 * authentification expirée, base ou bogue : transitoire.
 */
export function classify(error: unknown): Failure {
  if (error instanceof GitNotFoundError) return { outcome: failedWith("repo_not_found") };
  if (error instanceof GitProviderUnavailableError) return { retry: "provider_unavailable" };
  if (error instanceof GitRateLimitedError) return { retry: "provider_rate_limited" };
  if (error instanceof GitAuthExpiredError) return { retry: "provider_auth_expired" };
  return { retry: "internal" };
}
