/**
 * Erreurs du moteur `AiProvider` (TK-95). Aucune ne nomme un fournisseur, un modèle ni une clé : le
 * texte peut remonter tel quel jusqu'au client (le libellé à l'écran relève de TK-98).
 */

export const AI_NOT_CONFIGURED_REASONS = ["no-credential", "eu-restricted"] as const;
export type AiNotConfiguredReason = (typeof AI_NOT_CONFIGURED_REASONS)[number];

/** Aucun fournisseur utilisable pour cet appel (aucune clé, ou seuls des fournisseurs exclus par euOnly). */
export class AiNotConfiguredError extends Error {
  readonly reason: AiNotConfiguredReason;
  constructor(reason: AiNotConfiguredReason) {
    super("Aucun agent IA n'est configuré pour cet appel");
    this.name = "AiNotConfiguredError";
    this.reason = reason;
  }
}

/** Plafond mensuel atteint : l'appel est refusé avant tout appel réseau. */
export class AiCapReachedError extends Error {
  constructor() {
    super("Le plafond mensuel des actions IA est atteint");
    this.name = "AiCapReachedError";
  }
}
