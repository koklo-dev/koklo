import type { GitAuthKind } from "./git-auth.ts";
import {
  type GitDenial,
  type GitErrorDiagnostic,
  gitDenialOf,
  httpStatusOf,
  type OAuthErrorCode,
  oauthErrorCodeOf,
} from "./git-diagnostic.ts";
import type { GitOwner } from "./git-owner.ts";

export type RepoCreationForbiddenReason = "missing-user-token" | "resource-not-accessible";

/** Racine des erreurs du port Git ; aucune ne porte de jeton ni de secret. */
export class GitProviderError extends Error {
  readonly operation: string;
  /** Statut HTTP de l'appel fautif, quand il existe. Absent (pas `undefined`) sinon. */
  declare readonly status?: number;
  /** Code OAuth public de GitHub (liste blanche), jamais le corps de la réponse. */
  declare readonly oauthError?: OAuthErrorCode;
  /** Motif d'un refus 403 (liste fermée), jamais le message de GitHub. */
  declare readonly denial?: GitDenial;
  constructor(operation: string, message?: string, diagnostic?: GitErrorDiagnostic) {
    super(message ?? `Échec de l'opération Git ${operation}`);
    this.name = "GitProviderError";
    this.operation = operation;
    const status = httpStatusOf(diagnostic?.status);
    const oauthError = oauthErrorCodeOf(diagnostic?.oauthError);
    const denial = gitDenialOf(diagnostic?.denial);
    if (status !== undefined) this.status = status;
    if (denial !== undefined) this.denial = denial;
    if (oauthError !== undefined) this.oauthError = oauthError;
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

/** Le `code` d'autorisation est refusé, expiré ou déjà utilisé ; il n'est pas repris dans l'erreur. */
export class InvalidUserCodeError extends GitProviderError {
  constructor(input: { operation: string } & GitErrorDiagnostic) {
    super(input.operation, "Le code d'autorisation GitHub est invalide ou expiré.", input);
    this.name = "InvalidUserCodeError";
  }
}
