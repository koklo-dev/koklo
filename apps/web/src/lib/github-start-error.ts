import { errorCode, errorData } from "./api-error.ts";
import { GENERIC_ERROR } from "./form-errors.ts";
import { RESTRICTED_TEXT } from "./github-labels.ts";

export interface StartFailure {
  title?: string;
  text: string;
  /** La liste est périmée (installation retirée) : à recharger. */
  reloadList?: boolean;
}

export const START_FAILED: StartFailure = {
  title: "Impossible de lancer l'installation",
  text: GENERIC_ERROR,
};

/** Message d'une erreur de `installation.start` (S-github §4), d'après son code typé. */
export function describeStartError(error: unknown): StartFailure {
  switch (errorCode(error)) {
    case "PROVIDER_UNAVAILABLE":
      return {
        title: "L'installation n'est pas disponible pour le moment",
        text: "L'application GitHub n'est pas configurée sur cet environnement, ou GitHub ne répond pas. Réessayez plus tard ou contactez la personne qui administre Koklo.",
      };
    case "VALIDATION":
      if (errorData(error)?.message !== "too_many_pending") return START_FAILED;
      return {
        title: "Trop de tentatives en cours",
        text: "Plusieurs installations ont été commencées sans être terminées. Attendez 10 minutes puis réessayez.",
      };
    case "NOT_FOUND":
      return {
        title: "Cette installation n'existe plus",
        text: "Rechargez la page pour voir la liste à jour.",
        reloadList: true,
      };
    case "FORBIDDEN":
      return { text: RESTRICTED_TEXT };
    default:
      return START_FAILED;
  }
}
