/**
 * Gabarit commun des pastilles de statut (DESIGN.md v2 §5.1) : 24 px, pastille complète, 12/500, icône de
 * 16 px puis libellé. Le libellé ne se coupe pas : c'est la ligne qui passe à la suivante.
 */
export const STATUS_PILL =
  "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-caption";

/** Tonalités partagées par `ValidationStatus`, `DeliverableStatus` et `LifecycleStatus` (couleurs de §2.2). */
export const STATUS_TONE = {
  validated: "bg-status-validated text-status-validated-foreground",
  pending: "bg-status-pending text-status-pending-foreground",
  revise: "bg-status-revise text-status-revise-foreground",
  unsubmitted: "bg-secondary text-muted-foreground",
  neutral: "bg-secondary text-foreground",
} as const;
