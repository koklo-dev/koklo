/** Identifiants DOM de l'écran de cadrage (une seule instance par page) : cibles du focus. */
export const IDS = {
  title: "framing-title",
  idea: "framing-idea",
  clarifications: "framing-clarifications",
  pastedBrief: "framing-pasted-brief",
  stepBrief: "framing-step-brief",
  stepProposals: "framing-step-proposals",
  briefTitle: "framing-brief-title",
  error: "framing-error",
  callBrief: "framing-call-brief",
  callPropose: "framing-call-propose",
  replaceKeep: "framing-replace-keep",
} as const;

/** Identifiant d'un champ d'une carte de proposition. */
export const proposalFieldId = (proposalId: string, field: string): string =>
  `proposal-${proposalId}-${field.replaceAll(".", "-")}`;

/** Identifiant de la carte d'une proposition (focusable, cible du focus après un échec désigné). */
export const proposalCardId = (proposalId: string): string => `proposal-${proposalId}`;
