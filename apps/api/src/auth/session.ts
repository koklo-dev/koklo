import type { IncomingHttpHeaders } from "node:http";

export const SESSION_RESOLVER = Symbol("SESSION_RESOLVER");

/** Utilisateur authentifié, sans organisation (création et liste des organisations). */
export interface UserSession {
  userId: string;
}

/** Session authentifiée : l'utilisateur et l'organisation pour laquelle il agit. */
export interface AuthSession extends UserSession {
  organizationId: string;
  /** Rôle relu dans `members` à chaque requête ; absent des sessions de test par en-tête. */
  role?: string;
}

export interface SessionResolver {
  /** `null` : requête non authentifiée (ou session inutilisable : expirée, sans organisation, non membre). */
  resolve(headers: IncomingHttpHeaders): Promise<AuthSession | null>;
  /** Session valide, organisation active non requise ; `null` si absente ou expirée. */
  resolveUser(headers: IncomingHttpHeaders): Promise<UserSession | null>;
}
