import type { CardVariant, IconName, InlineAlertVariant } from "@koklo/ui";

/** Données fictives de la galerie, section « Surfaces · A » (TK-139). Aucun nom de fournisseur d'IA. */
export const CARD_VARIANTS: ReadonlyArray<{
  variant: CardVariant;
  title: string;
  description: string;
}> = [
  { variant: "panel", title: "Carte panel", description: "Rayon 12, marges 16 et 18." },
  { variant: "inset", title: "Carte inset", description: "Sous-carte sur --surface, rayon 10." },
  {
    variant: "proposal",
    title: "Carte proposal",
    description: "Proposition de l'agent, bordure pointillée.",
  },
  { variant: "dashed", title: "Carte dashed", description: "Invitation ou ajout, pointillé fort." },
  {
    variant: "warning",
    title: "Carte warning",
    description: "Bordure ambre, à lire avant d'agir.",
  },
];

export const STATS: ReadonlyArray<{
  label: string;
  icon: IconName;
  value: string;
  note: string;
  gauge?: { value: number; label: string };
}> = [
  { label: "Projets actifs", icon: "folder_open", value: "12", note: "dont 3 en cadrage" },
  { label: "Membres", icon: "groups", value: "28", note: "2 invitations en attente" },
  { label: "Fonctionnalités validées", icon: "check_circle", value: "74", note: "sur 96 décrites" },
  {
    label: "Consommation du mois",
    icon: "speed",
    value: "38 %",
    note: "du plafond mensuel",
    gauge: { value: 38, label: "Part du plafond mensuel consommée" },
  },
];

export const PROGRESS_VALUES = [0, 40, 100] as const;

export const ALERTS: ReadonlyArray<{
  variant: InlineAlertVariant;
  icon: IconName;
  text: string;
  action?: string;
}> = [
  {
    variant: "neutral",
    icon: "lock",
    text: "Votre texte est envoyé à l'agent IA avec la clé de l'organisation.",
    action: "Détails",
  },
  { variant: "success", icon: "check_circle", text: "Dossier enregistré. Rien d'autre à faire." },
  {
    variant: "validated",
    icon: "check_circle",
    text: "Vous avez validé ce parcours.",
    action: "Annuler",
  },
  {
    variant: "revise",
    icon: "edit_note",
    text: "Votre demande de changement est envoyée.",
    action: "Annuler",
  },
  {
    variant: "agent",
    icon: "wand_stars",
    text: "L'agent propose 3 critères d'acceptation pour cette fonctionnalité.",
  },
  {
    variant: "warning",
    icon: "schedule",
    text: "Trop de demandes. Nouvel essai possible dans 28 s.",
    action: "Annuler",
  },
  {
    variant: "error",
    icon: "error",
    text: "Le fournisseur n'a pas répondu à temps.",
    action: "Réessayer",
  },
];
