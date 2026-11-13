import { formatCount } from "@koklo/ui";

/** Libellés de la vue client des Données (maquette 11 l.160-167, 596) : un seul endroit pour les phrases. */
export const CLIENT_DATA_STATUS = "Validé par l'équipe";
export const READONLY_LEAD = "Lecture seule.";
const READONLY_BASE = "Le modèle de données est validé par l'équipe.";
export const READONLY_COMMENT_TEXT = `${READONLY_BASE} Vous pouvez le lire et commenter ce qui vous semble manquer ou faux.`;
export const READONLY_PLAIN_TEXT = `${READONLY_BASE} Vous pouvez le lire.`;
export const NOT_VALIDATED_TITLE = "Le modèle de données n'est pas encore validé";
export const NOT_VALIDATED_TEXT =
  "L'équipe le relit d'abord. Il apparaîtra ici, en lecture seule, dès qu'elle l'aura validé.";
export const CLIENT_LOAD_ERROR_TITLE = "Impossible de charger le modèle de données";
export const CLIENT_LOAD_ERROR_TEXT = "Le modèle de données n'a pas pu être lu. Réessayez.";
export const CLIENT_SUMMARY_LABEL = "Ce qu'on enregistre";
export const CLIENT_SUMMARY_MISSING = "L'équipe n'a pas encore rédigé le résumé de cette table.";
export const TRUNCATED_NOTE = (shown: number): string =>
  `Seules les ${formatCount(shown)} premières tables sont affichées.`;

/** « 6 tables · lecture seule » (maquette 11 l.596). */
export function clientSummaryOf(tables: number): string {
  return `${formatCount(tables)} ${tables >= 2 ? "tables" : "table"} · lecture seule`;
}

export const COMMENT_BUTTON = "Commenter";
export const commentTitleOf = (tableName: string): string => `Commenter la table « ${tableName} »`;
export const COMMENT_HELP = "Dites à l'équipe ce qui vous semble manquer ou faux dans cette table.";
export const COMMENT_LABEL = "Votre commentaire";
export const COMMENT_FAILED = "Le commentaire n'a pas pu être envoyé. Réessayez.";
export const COMMENT_SENT = "Commentaire envoyé";
