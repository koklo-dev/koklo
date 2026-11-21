import { formatCount } from "@koklo/ui";

/** Libellés de la vue client de l'Architecture (maquette 13 l.132-137, 865) : un seul endroit pour les phrases. */
export const CLIENT_ARCHITECTURE_STATUS = "Validé par l'équipe";
export const CLIENT_READONLY_LEAD = "Lecture seule.";
const READONLY_BASE =
  "L'architecture décrit comment le produit est construit. Elle est validée par l'équipe ;";
export const CLIENT_READONLY_COMMENT_TEXT = `${READONLY_BASE} vous pouvez la lire et poser vos questions en commentaire.`;
export const CLIENT_READONLY_PLAIN_TEXT = `${READONLY_BASE} vous pouvez la lire.`;
export const CLIENT_NOT_VALIDATED_TITLE = "L'architecture n'est pas encore validée";
export const CLIENT_NOT_VALIDATED_TEXT =
  "L'équipe la relit d'abord. Elle apparaîtra ici, en lecture seule, dès qu'elle l'aura validée.";
export const CLIENT_ARCHITECTURE_ERROR_TITLE = "Impossible de charger l'architecture";
export const CLIENT_ARCHITECTURE_ERROR_TEXT = "L'architecture n'a pas pu être lue. Réessayez.";
export const CLIENT_SERVES_LABEL = "Sert";
export const CLIENT_SUMMARY_MISSING = "L'équipe n'a pas encore rédigé le résumé de ce composant.";
export const CLIENT_TRUNCATED_NOTE = (shown: number): string =>
  `Seuls les ${formatCount(shown)} premiers composants sont affichés.`;
export const CLIENT_COMMENT_SENT = "Commentaire envoyé";

const plural = (count: number, one: string, other: string): string =>
  `${formatCount(count)} ${count >= 2 ? other : one}`;

/** « 34 composants · 23 décisions · 18 flux · lecture seule » (maquette 13 l.865). */
export function clientArchitectureSummary(counts: {
  components: number;
  decisions: number | undefined;
  flows: number | undefined;
}): string {
  return [
    plural(counts.components, "composant", "composants"),
    ...(counts.decisions === undefined ? [] : [plural(counts.decisions, "décision", "décisions")]),
    ...(counts.flows === undefined ? [] : [plural(counts.flows, "flux", "flux")]),
    "lecture seule",
  ].join(" · ");
}

export const clientCommentTitle = (kind: "component" | "adr" | "archflow", name: string): string =>
  `Commenter ${kind === "component" ? "le composant" : kind === "adr" ? "la décision" : "le flux"} « ${name} »`;
