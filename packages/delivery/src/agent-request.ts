/** Garde unique d'un runtime avant tout lancement. */
import type { AgentSessionRequest } from "./agent-runtime.ts";

/**
 * Retourne un instantané gelé en profondeur, chaque champ lu une seule fois (anti-TOCTOU).
 * Un signal déjà annulé n'est PAS une erreur : le runtime répond `aborted` sans lancer.
 */
export const assertSessionRequest = (_request: AgentSessionRequest): AgentSessionRequest => {
  throw new Error("not implemented");
};
