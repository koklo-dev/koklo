import type { Criterion } from "./entities/index.ts";

/**
 * Vocabulaire canonique du Markdown d'une feature, partagé par l'émetteur (qui l'écrit tel quel) et
 * le parseur (qui le reconnaît, avec ses tolérances : « e » pour « è », apostrophe typographique).
 */
export const DESCRIPTION_TITLE = "Description";
export const CRITERIA_TITLE = "Critères d'acceptation";

/** Étiquette en gras d'une étape, par type d'étape. */
export const STEP_LABEL_BY_TYPE: Record<Criterion["etapes"][number]["type"], string> = {
  etant_donne: "Étant donné",
  quand: "Quand",
  alors: "Alors",
  et: "Et",
};
