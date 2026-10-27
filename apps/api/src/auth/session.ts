import type { IncomingHttpHeaders } from "node:http";

export const SESSION_RESOLVER = Symbol("SESSION_RESOLVER");

/** Session authentifiée : l'utilisateur et l'organisation pour laquelle il agit. */
export interface AuthSession {
  userId: string;
  organizationId: string;
}

export interface SessionResolver {
  /** `null` : requête non authentifiée (ou session inutilisable : expirée, sans organisation, non membre). */
  resolve(headers: IncomingHttpHeaders): Promise<AuthSession | null>;
}
