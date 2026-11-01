import type { AuthSession } from "../auth/session.ts";

export const PROJECT_ACCESS = Symbol("PROJECT_ACCESS");

/**
 * Accès d'une session aux projets de son organisation (TK-55a, cloisonnement central). Les rôles
 * d'équipe et le business voient toute l'organisation ; le `client` seulement les projets liés
 * (`project_client_access`). Fail-closed : un rôle absent ou inconnu est traité comme un client.
 */
export interface ProjectAccess {
  /**
   * Lève `NOT_FOUND` (jamais `FORBIDDEN`, même corps que « projet absent ») si la session n'atteint
   * pas le projet : client non lié, projet d'une autre organisation ou inexistant.
   */
  assertAccessible(session: AuthSession, projectId: string): Promise<void>;
  /** `null` : toute l'organisation. Sinon les projets liés (`[]` : client sans lien, rôle absent). */
  linkedProjectIds(session: AuthSession): Promise<string[] | null>;
}

/**
 * Vrai si le rôle est cloisonné par projet : `client`, rôle absent ou hors des cinq rôles d'équipe.
 * Squelette de l'étape Red (volontairement fail-open) : le Green l'implémente sur `STAFF_ROLES`.
 */
export function isProjectScoped(_role: string | undefined): boolean {
  return false;
}
