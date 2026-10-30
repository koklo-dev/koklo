/** Jeton utilisateur fourni par l'appelant ; les instants sont des ISO-8601 UTC. */
export type GitUserCredentials = {
  readonly token: string;
  readonly expiresAt: string;
  readonly refreshToken?: string;
  readonly refreshExpiresAt?: string;
};

/** Contexte d'authentification passé explicitement à chaque opération du port. */
export type GitAuth =
  | { readonly kind: "installation"; readonly token: string; readonly expiresAt: string }
  | ({ readonly kind: "user" } & GitUserCredentials);

export type GitAuthKind = GitAuth["kind"];
