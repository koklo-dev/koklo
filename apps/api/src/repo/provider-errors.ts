import {
  GitAuthExpiredError,
  GitConflictError,
  GitNotFoundError,
  GitProviderUnavailableError,
  GitRateLimitedError,
  RepoCreationForbiddenError,
  UserTokenRequiredError,
} from "@koklo/domain";
import { ORPCError } from "@orpc/server";
import { conflict, notFound } from "../tracker/api-errors.ts";

/** Opération du port qui a échoué : le même conflit n'a pas le même sens selon l'étape. */
export type ProviderStep =
  | "authenticate"
  | "createRepo"
  | "getRepo"
  | "readFile"
  | "writeCommit"
  | "createBranch";

/**
 * Erreurs du port vers les erreurs typées du contrat, par `instanceof` (le `name` d'une erreur est
 * énumérable donc falsifiable). Rien du message du fournisseur ne sort ; une erreur inconnue, ou
 * une anomalie (conflit sur un dépôt qu'on vient de créer), est rendue telle quelle et deviendra
 * `INTERNAL` dans `guard`.
 */
export function mapProviderError(error: unknown, step: ProviderStep): unknown {
  if (error instanceof UserTokenRequiredError) {
    return new ORPCError("USER_TOKEN_REQUIRED", { data: { ownerLogin: error.owner.login } });
  }
  if (error instanceof RepoCreationForbiddenError) {
    const { reason, owner } = error;
    return new ORPCError("REPO_CREATION_FORBIDDEN", {
      data: { reason, ownerLogin: owner.login, ownerKind: owner.kind },
    });
  }
  if (error instanceof GitAuthExpiredError) {
    const { kind, refreshable } = error;
    return new ORPCError("PROVIDER_AUTH_EXPIRED", { data: { kind, refreshable } });
  }
  if (error instanceof GitRateLimitedError) {
    const { retryAfterMs } = error;
    return new ORPCError("PROVIDER_RATE_LIMITED", {
      data: retryAfterMs === undefined ? {} : { retryAfterMs },
    });
  }
  if (error instanceof GitProviderUnavailableError) {
    return new ORPCError("PROVIDER_UNAVAILABLE");
  }
  if (error instanceof GitConflictError && error.reason === "exists" && step === "createRepo") {
    return conflict("repo_name_taken");
  }
  if (error instanceof GitNotFoundError && (step === "getRepo" || step === "readFile")) {
    return notFound();
  }
  return error;
}
