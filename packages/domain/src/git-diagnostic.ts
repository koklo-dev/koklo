/**
 * Codes d'erreur OAuth publics de GitHub (champ `error` des réponses de `/login/oauth/*`). Liste
 * blanche : seuls ces codes, qui ne contiennent jamais de secret, peuvent sortir dans un journal.
 */
export const OAUTH_ERROR_CODES = [
  "access_denied",
  "application_suspended",
  "authorization_pending",
  "bad_refresh_token",
  "bad_verification_code",
  "device_flow_disabled",
  "expired_token",
  "incorrect_client_credentials",
  "incorrect_device_code",
  "invalid_client",
  "invalid_grant",
  "invalid_request",
  "invalid_scope",
  "redirect_uri_mismatch",
  "slow_down",
  "unauthorized_client",
  "unsupported_grant_type",
] as const;

export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number];

/** Le code s'il est exactement l'un des codes publics connus, sinon `undefined`. */
export function oauthErrorCodeOf(value: unknown): OAuthErrorCode | undefined {
  return OAUTH_ERROR_CODES.find((code) => code === value);
}

/**
 * Motif d'un refus 403, énumération fermée calculée par l'adaptateur à partir du message de GitHub.
 * Jamais le texte lui-même : seule une de ces valeurs peut sortir dans un journal.
 */
export const GIT_DENIALS = [
  "resource_not_accessible",
  "app_blocked",
  "access_policy",
  "saml_enforcement",
  "permission_missing",
  "other",
] as const;

export type GitDenial = (typeof GIT_DENIALS)[number];

/** La valeur si elle est exactement l'un des motifs connus, sinon `undefined`. */
export function gitDenialOf(value: unknown): GitDenial | undefined {
  return GIT_DENIALS.find((denial) => denial === value);
}

/** Ce que l'on peut dire d'un échec fournisseur sans rien fuiter : statut, code OAuth public, motif de refus. */
export type GitErrorDiagnostic = {
  readonly status?: number | undefined;
  readonly oauthError?: OAuthErrorCode | undefined;
  readonly denial?: GitDenial | undefined;
};

const HTTP_MIN = 100;
const HTTP_MAX = 599;

/** Statut HTTP valide (entier 100-599) ou `undefined`. */
export function httpStatusOf(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= HTTP_MIN && (value as number) <= HTTP_MAX
    ? (value as number)
    : undefined;
}
