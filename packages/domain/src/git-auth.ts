/**
 * Jeton utilisateur fourni par l'appelant ; les instants sont des ISO-8601 UTC.
 * ATTENTION : porte des secrets (`token`, `refreshToken`). Ne jamais le journaliser,
 * le sérialiser ni l'inclure dans une erreur.
 */
export type GitUserCredentials = {
  readonly token: string;
  readonly expiresAt: string;
  readonly refreshToken?: string;
  readonly refreshExpiresAt?: string;
};

/**
 * Contexte d'authentification passé explicitement à chaque opération du port.
 * ATTENTION : porte des secrets (`token`). Ne jamais le journaliser, le sérialiser
 * ni l'inclure dans une erreur.
 */
export type GitAuth =
  | { readonly kind: "installation"; readonly token: string; readonly expiresAt: string }
  | ({ readonly kind: "user" } & GitUserCredentials);

export type GitAuthKind = GitAuth["kind"];
