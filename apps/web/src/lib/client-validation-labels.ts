import type { ClientSpaceProgress } from "@koklo/contract";

/** Statut de validation d'un élément pour `ValidationStatus` : « à valider » est l'attente (jamais « précédemment validé »). */
export function validationOf(
  validation: "validated" | "to_validate" | "to_revise",
): "validated" | "pending" | "revise" {
  if (validation === "validated") return "validated";
  return validation === "to_revise" ? "revise" : "pending";
}

/** Raison du « Valider le cahier » désactivé (maquette 10 l.644), dite dans le résumé de l'en-tête (B611). */
export const FINISH_REASON = "Traitez chaque onglet pour finir";

/** Identifiant du résumé de l'en-tête, référencé par le bouton désactivé. */
export const SUMMARY_ID = "client-validation-summary";

/** Résumé de l'en-tête : la progression, puis la raison tant qu'il reste des éléments à traiter. */
export function headerSummary(progress: ClientSpaceProgress): string {
  const base = progressSummary(progress);
  return progress.untreated === 0 ? base : `${base} · ${FINISH_REASON}`;
}

/** « Fonctionnalités 12/248 · parcours 3/18 · règles et rôles 1/2 » (maquette 10 l.629). */
export function progressSummary({ tabs }: ClientSpaceProgress): string {
  const blocks = {
    treated: tabs.rules.treated + tabs.roles.treated,
    units: tabs.rules.units + tabs.roles.units,
  };
  return [
    `Fonctionnalités ${tabs.features.treated}/${tabs.features.units}`,
    `parcours ${tabs.flows.treated}/${tabs.flows.units}`,
    `règles et rôles ${blocks.treated}/${blocks.units}`,
  ].join(" · ");
}

/** Texte du bandeau selon le lecteur : le client attendu, l'équipe qui valide sans client (D1), ou la lecture seule. */
export function bannerCopy(progress: ClientSpaceProgress): {
  tone: "warning" | "neutral";
  title: string;
  text: string;
} {
  if (progress.validation === "validated") {
    return {
      tone: "neutral",
      title: "Le cahier est validé.",
      text: "Toute modification ensuite vous sera re-présentée.",
    };
  }
  if (progress.canValidate && progress.hasClient) {
    return {
      tone: "warning",
      title: "Votre validation est attendue.",
      text: "Relisez chaque onglet : les fonctionnalités et les parcours un par un, les règles et les rôles en bloc. Le cahier est validé quand tout l'est.",
    };
  }
  if (progress.canValidate) {
    return {
      tone: "warning",
      title: "Aucun client n'est invité : la validation vous revient.",
      text: "Relisez chaque onglet. Le cahier est validé quand tout l'est.",
    };
  }
  return {
    tone: "neutral",
    title: "Vous consultez le cahier.",
    text: "La validation revient au client.",
  };
}

/** Phrase de confirmation d'une décision sur un parcours ou un bloc. */
export function doneText(noun: "parcours" | "bloc", requested: boolean): string {
  if (noun === "bloc") return requested ? "Changement demandé à l'équipe." : "Validé. Merci.";
  return requested ? "Changement demandé à l'équipe pour ce parcours." : "Parcours validé.";
}
