import type { GitAuthKind } from "./git-auth.ts";
import type { GitOwner } from "./git-owner.ts";

export type RepoCreationForbiddenReason = "missing-user-token" | "resource-not-accessible";

/** Racine des erreurs du port Git ; aucune ne porte de jeton ni de secret. */
export class GitProviderError extends Error {
  readonly operation: string;
  constructor(operation: string, message?: string) {
    super(message ?? `Échec de l'opération Git ${operation}`);
    this.name = "GitProviderError";
    this.operation = operation;
  }
}

export class RepoCreationForbiddenError extends GitProviderError {
  readonly owner: GitOwner;
  readonly reason: RepoCreationForbiddenReason;
  constructor(input: {
    operation: string;
    owner: GitOwner;
    reason: RepoCreationForbiddenReason;
  }) {
    super(
      input.operation,
      `GitHub refuse de créer le dépôt pour ${input.owner.login} (${input.reason}) : autorisez GitHub pour votre compte, ou créez le dépôt vide puis ajoutez-le à l'installation.`,
    );
    this.name = "RepoCreationForbiddenError";
    this.owner = input.owner;
    this.reason = input.reason;
  }
}

export class UserTokenRequiredError extends GitProviderError {
  readonly owner: GitOwner;
  constructor(input: { operation: string; owner: GitOwner }) {
    super(
      input.operation,
      `Un jeton utilisateur GitHub est requis pour créer un dépôt sur le compte ${input.owner.login}.`,
    );
    this.name = "UserTokenRequiredError";
    this.owner = input.owner;
  }
}

export class GitAuthExpiredError extends GitProviderError {
  readonly kind: GitAuthKind;
  readonly refreshable: boolean;
  constructor(input: { operation: string; kind: GitAuthKind; refreshable: boolean }) {
    super(
      input.operation,
      `Le jeton ${input.kind} a expiré${input.refreshable ? " : rafraîchissez-le" : " : réauthentifiez-vous"}.`,
    );
    this.name = "GitAuthExpiredError";
    this.kind = input.kind;
    this.refreshable = input.refreshable;
  }
}

export class GitNotFoundError extends GitProviderError {
  readonly resource: string;
  readonly identifier: string;
  constructor(input: { operation: string; resource: string; identifier: string }) {
    super(input.operation, `Introuvable (${input.resource}) : ${input.identifier}`);
    this.name = "GitNotFoundError";
    this.resource = input.resource;
    this.identifier = input.identifier;
  }
}

/**
 * Cause d'un conflit : `exists` (dépôt, branche ou tag déjà présent), `stale-sha`
 * (la tête de la PR n'est plus `expectedHeadSha`), `not-mergeable` (fusion refusée).
 */
export type GitConflictReason = "exists" | "stale-sha" | "not-mergeable";

export class GitConflictError extends GitProviderError {
  readonly reason: GitConflictReason;
  readonly identifier: string;
  constructor(input: { operation: string; reason: GitConflictReason; identifier: string }) {
    super(input.operation, `Conflit Git (${input.reason}) : ${input.identifier}`);
    this.name = "GitConflictError";
    this.reason = input.reason;
    this.identifier = input.identifier;
  }
}

export class GitRateLimitedError extends GitProviderError {
  readonly retryAfterMs: number | undefined;
  constructor(input: { operation: string; retryAfterMs: number | undefined }) {
    super(
      input.operation,
      input.retryAfterMs === undefined
        ? "Quota Git dépassé : réessayez plus tard."
        : `Quota Git dépassé : réessayez dans ${input.retryAfterMs} ms.`,
    );
    this.name = "GitRateLimitedError";
    this.retryAfterMs = input.retryAfterMs;
  }
}

export class GitProviderUnavailableError extends GitProviderError {
  constructor(input: { operation: string }) {
    super(input.operation, "Le fournisseur Git est indisponible : réessayez plus tard.");
    this.name = "GitProviderUnavailableError";
  }
}
