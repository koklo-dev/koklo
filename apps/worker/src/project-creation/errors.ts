import {
  GitAuthExpiredError,
  GitConflictError,
  GitNotFoundError,
  GitProviderError,
  GitProviderUnavailableError,
  GitRateLimitedError,
  type ProjectCreationErrorCode,
  RepoCreationForbiddenError,
  UserTokenRequiredError,
} from "@koklo/domain";
import { InvalidRepoNameError, type ProviderStep, ProvisionError } from "@koklo/github";

/** Échec de création rendu à l'écran : code fermé et compléments publics (jamais un message brut). */
export interface CreationFailure {
  code: ProjectCreationErrorCode;
  ownerLogin?: string;
  retryAfterMs?: number;
  /** Panne passagère (réseau, 5xx) : pg-boss relance avant le dernier essai. */
  transient: boolean;
}

const definitive = (code: ProjectCreationErrorCode, extra: Partial<CreationFailure> = {}) =>
  ({ code, ...extra, transient: false }) satisfies CreationFailure;

/** Erreurs d'authentification et de dépôt du port, selon l'étape qui a échoué. */
function portFailure(error: unknown, step: ProviderStep): CreationFailure | undefined {
  if (error instanceof UserTokenRequiredError) {
    return definitive("user_token_required", { ownerLogin: error.owner.login });
  }
  if (error instanceof RepoCreationForbiddenError) {
    const code =
      error.reason === "missing-user-token" ? "user_token_required" : "resource_not_accessible";
    return definitive(code, { ownerLogin: error.owner.login });
  }
  if (error instanceof GitAuthExpiredError) {
    return definitive(error.kind === "user" ? "auth_expired_user" : "auth_expired_installation");
  }
  if (error instanceof GitRateLimitedError) {
    return definitive("rate_limited", {
      ...(error.retryAfterMs === undefined ? {} : { retryAfterMs: error.retryAfterMs }),
    });
  }
  if (error instanceof GitProviderUnavailableError) {
    return { code: "provider_unavailable", transient: true };
  }
  if (error instanceof GitConflictError && error.reason === "exists" && step === "createRepo") {
    return definitive("name_taken");
  }
  if (error instanceof GitNotFoundError && step === "authenticate") {
    return definitive("account_unavailable");
  }
  return undefined;
}

/**
 * Projette une panne du provisionnement sur un code de la liste fermée. Seules les classes du port
 * (testées par `instanceof`, jamais par `name`) comptent ; le message du fournisseur n'est pas lu.
 */
export function classifyCreationError(error: unknown): CreationFailure {
  if (error instanceof InvalidRepoNameError) return definitive("invalid_name");
  if (!(error instanceof ProvisionError)) return definitive("unknown");
  const known = portFailure(error.cause, error.step);
  if (known) return known;
  if (error.cause instanceof GitProviderError && error.cause.status === 403) {
    return definitive("forbidden");
  }
  return definitive("unknown");
}
