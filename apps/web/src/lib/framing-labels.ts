import { plural } from "./features-region.ts";

/** Textes de l'écran de cadrage (design/screens/S-framing.md) : une seule source pour les annonces et les messages. */
export const HELP_TEXT =
  "L'IA propose, vous décidez. Rien n'est enregistré dans la spec avant votre confirmation.";
export const BUSY_TEXT =
  "Génération en cours. Cela peut prendre une minute. Vous pouvez continuer à lire.";
export const BRIEF_READY_TEXT = "Brief prêt, relisez-le.";
export const SAVING_TEXT = "Enregistrement en cours…";
export const CHECKING_TEXT = "Chargement du cadrage…";
export const NOT_READY_TEXT =
  "La spec du projet n'est pas prête : vous pouvez cadrer, mais l'enregistrement sera possible quand elle le sera.";
export const NO_SPEC_TEXT = "Le projet n'a pas encore de spec.";
export const SPEC_FAILED_TEXT = "La préparation de la spec a échoué.";
export const DESIGNER_TEXT =
  "En tant que designer, vous ne pouvez enregistrer qu'une fonctionnalité liée à un écran. Les propositions n'en ont pas : relisez-les ici, puis créez-les depuis le formulaire de la fonctionnalité.";
const ANNOUNCE_TITLE_MAX = 60;

/** « N proposition(s) à relire. » */
export const proposalsReadyText = (count: number): string =>
  `${plural(count, "proposition")} à relire.`;

/** « Proposition « titre » acceptée. », titre tronqué à 60 caractères. */
export function statusChangeText(title: string, verb: "acceptée" | "rejetée"): string {
  const short = title.length > ANNOUNCE_TITLE_MAX ? title.slice(0, ANNOUNCE_TITLE_MAX) : title;
  return `Proposition « ${short} » ${verb}.`;
}

/** « N acceptée(s) sur M » puis « K rejetée(s) » quand il y en a. */
export function countsText(accepted: number, total: number, rejected: number): string {
  const base = `${accepted} ${accepted > 1 ? "acceptées" : "acceptée"} sur ${total}`;
  return rejected > 0 ? `${base}, ${rejected} ${rejected > 1 ? "rejetées" : "rejetée"}` : base;
}

/** Nombre avec espace insécable des milliers : « 8 000 ». */
export const thousands = (value: number): string =>
  String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** « N fonctionnalité(s) » : titre du suivi d'un lot, repris tel quel à la reprise au rechargement. */
export const batchTitle = (count: number): string => plural(count, "fonctionnalité");
export const BATCH_TITLE = /^\d+ fonctionnalités?$/;

export const createdText = (title: string): string =>
  `${title} ${title.startsWith("1 ") ? "créée" : "créées"}.`;
