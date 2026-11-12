/** Identifiant DOM de l'avis d'erreur de l'agent : cible du focus après un échec (une seule instance par page). */
export const AI_ERROR_ID = "ai-error";

/** Identifiant d'un champ d'une carte de proposition. */
export const proposalFieldId = (proposalId: string, field: string): string =>
  `proposal-${proposalId}-${field.replaceAll(".", "-")}`;

/** Identifiant de la carte d'une proposition (focusable, cible du focus après un échec désigné). */
export const proposalCardId = (proposalId: string): string => `proposal-${proposalId}`;
