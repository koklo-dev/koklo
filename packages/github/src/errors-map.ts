import {
  type GitAuth,
  GitAuthExpiredError,
  GitConflictError,
  type GitConflictReason,
  type GitDenial,
  GitNotFoundError,
  type GitOwner,
  GitProviderError,
  GitProviderUnavailableError,
  GitRateLimitedError,
  oauthErrorCodeOf,
  RepoCreationForbiddenError,
} from "@koklo/domain";
import type { RequestError } from "@octokit/request-error";

/** Ce que l'on sait de l'opération en échec ; rien de secret, rien venant de la réponse. */
export type ErrorContext = {
  readonly operation: string;
  /** Identité utilisée, pour `GitAuthExpiredError`. */
  readonly credential: { readonly kind: GitAuth["kind"]; readonly refreshable: boolean };
  readonly resource: string;
  readonly identifier: string;
  /** Renseigné par `createRepo` : propriétaire visé par un 403. */
  readonly owner?: GitOwner;
  /** Raison d'un 409 (défaut : la cible a bougé). */
  readonly conflict?: GitConflictReason;
};

const KNOWN_STATUS_MIN = 100;

/** Reconnaît une `RequestError` Octokit sans `instanceof` (plusieurs copies du paquet possibles). */
export function isRequestError(error: unknown): error is RequestError {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { status?: unknown }).status === "number" &&
    (error as { status: number }).status >= KNOWN_STATUS_MIN
  );
}

const header = (error: RequestError, name: string): string | undefined => {
  const value = error.response?.headers?.[name];
  return value === undefined ? undefined : String(value);
};

/** Messages renvoyés par GitHub (message principal et erreurs de validation), en minuscules. */
const messages = (error: RequestError): string => {
  const data = error.response?.data as
    | { message?: unknown; errors?: ReadonlyArray<unknown> }
    | undefined;
  const details = (data?.errors ?? []).map((item) =>
    typeof item === "string" ? item : String((item as { message?: unknown }).message ?? ""),
  );
  return [String(data?.message ?? ""), ...details].join(" | ").toLowerCase();
};

const DENIAL_RULES: ReadonlyArray<readonly [RegExp, GitDenial]> = [
  [/resource not accessible by integration/, "resource_not_accessible"],
  [/blocked/, "app_blocked"],
  [/access policy|third-party/, "access_policy"],
  [/saml/, "saml_enforcement"],
  [/permission|must have/, "permission_missing"],
];

/** Motif d'un 403 : valeur de la liste fermée, jamais le texte de GitHub. */
function denialOf(error: RequestError): GitDenial {
  const text = messages(error);
  return DENIAL_RULES.find(([pattern]) => pattern.test(text))?.[1] ?? "other";
}

function retryAfterMs(error: RequestError, now: () => Date): number | undefined {
  const retryAfter = Number(header(error, "retry-after"));
  if (Number.isFinite(retryAfter) && header(error, "retry-after") !== undefined) {
    return Math.max(0, retryAfter * 1000);
  }
  const reset = Number(header(error, "x-ratelimit-reset"));
  if (header(error, "x-ratelimit-reset") !== undefined && Number.isFinite(reset)) {
    return Math.max(0, reset * 1000 - now().getTime());
  }
  return undefined;
}

function isRateLimited(error: RequestError): boolean {
  if (error.status === 429) return true;
  if (error.status !== 403) return false;
  return (
    header(error, "retry-after") !== undefined ||
    header(error, "x-ratelimit-remaining") === "0" ||
    /rate limit/.test(messages(error))
  );
}

function mapUnprocessable(error: RequestError, context: ErrorContext): GitProviderError {
  const text = messages(error);
  if (/already exists/.test(text)) {
    return new GitConflictError({
      operation: context.operation,
      reason: "exists",
      identifier: context.identifier,
    });
  }
  if (/not a fast forward/.test(text)) {
    return new GitConflictError({
      operation: context.operation,
      reason: "stale-sha",
      identifier: context.identifier,
    });
  }
  return new GitProviderError(context.operation);
}

function mapForbidden(error: RequestError, context: ErrorContext): GitProviderError {
  if (context.owner === undefined) return new GitProviderError(context.operation);
  return new RepoCreationForbiddenError({
    operation: context.operation,
    owner: context.owner,
    reason: /not accessible by integration/.test(messages(error))
      ? "resource-not-accessible"
      : "missing-user-token",
  });
}

/**
 * Les classes du domaine posent `name` comme propriété propre énumérable : elle polluerait
 * `Object.keys`, `JSON.stringify` et les journaux structurés. Rendue non énumérable (comme
 * le `name` natif d'une `Error`), elle reste lisible.
 */
const quiet = (error: GitProviderError): GitProviderError =>
  Object.defineProperty(error, "name", {
    value: error.name,
    enumerable: false,
    writable: true,
    configurable: true,
  });

/**
 * Traduit une erreur HTTP GitHub en erreur typée du port. Fonction pure : ni la `RequestError`
 * (elle embarque la requête) ni le corps de la réponse ne sont conservés, ni en `cause` ni
 * dans le message. Les erreurs du port passent telles quelles.
 */
export const mapGitHubError = (
  error: unknown,
  context: ErrorContext,
  now: () => Date,
): GitProviderError => quiet(withDiagnostic(translate(error, context, now), error));

/**
 * Pose le statut HTTP, le code OAuth public et le motif de refus 403 (listes fermées) de la réponse fautive sur l'erreur
 * typée, sans jamais en garder le corps ni la cause. Ne remplace pas un diagnostic déjà présent.
 */
function withDiagnostic(mapped: GitProviderError, source: unknown): GitProviderError {
  if (!isRequestError(source)) return mapped;
  const oauthError = oauthErrorCodeOf(
    (source.response?.data as { error?: unknown } | undefined)?.error,
  );
  const found = {
    status: source.status,
    ...(oauthError === undefined ? {} : { oauthError }),
    ...(source.status === 403 ? { denial: denialOf(source) } : {}),
  };
  for (const [key, value] of Object.entries(found)) {
    if (!(key in mapped)) Object.defineProperty(mapped, key, { value, enumerable: false });
  }
  return mapped;
}

function translate(error: unknown, context: ErrorContext, now: () => Date): GitProviderError {
  if (error instanceof GitProviderError) return error;
  if (!isRequestError(error)) return new GitProviderError(context.operation);
  if (error.status === 401) {
    return new GitAuthExpiredError({ operation: context.operation, ...context.credential });
  }
  if (isRateLimited(error)) {
    return new GitRateLimitedError({
      operation: context.operation,
      retryAfterMs: retryAfterMs(error, now),
    });
  }
  switch (error.status) {
    case 403:
      return mapForbidden(error, context);
    case 404:
      return new GitNotFoundError({
        operation: context.operation,
        resource: context.resource,
        identifier: context.identifier,
      });
    case 405:
      return new GitConflictError({
        operation: context.operation,
        reason: "not-mergeable",
        identifier: context.identifier,
      });
    case 409:
      return new GitConflictError({
        operation: context.operation,
        reason: context.conflict ?? "stale-sha",
        identifier: context.identifier,
      });
    case 422:
      return mapUnprocessable(error, context);
    default:
      return error.status >= 500
        ? new GitProviderUnavailableError({ operation: context.operation })
        : new GitProviderError(context.operation);
  }
}

/** Statut HTTP d'une erreur, pour le journal ; `undefined` si ce n'est pas une erreur HTTP. */
export const statusOf = (error: unknown): number | undefined =>
  isRequestError(error) ? error.status : undefined;
