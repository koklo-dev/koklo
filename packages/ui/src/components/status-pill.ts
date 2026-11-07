/**
 * Tons des pastilles (`Pill`, DESIGN.md §5.5) : couleurs en jetons uniquement. Les tons `success`, `warning`
 * et `danger` reprennent les couleurs de statut de §2.2.
 */
export const PILL_TONE = {
  neutral: "bg-secondary text-foreground",
  soft: "bg-secondary text-secondary-foreground",
  outline: "border border-border text-muted-foreground",
  dashed: "border border-dashed border-border-strong text-muted-foreground",
  primary: "bg-primary text-primary-foreground",
  success: "bg-status-validated text-status-validated-foreground",
  warning: "bg-status-pending text-status-pending-foreground",
  danger: "bg-status-revise text-status-revise-foreground",
  muted: "bg-secondary text-muted-foreground",
} as const;

/**
 * Gabarit commun des pastilles de statut (DESIGN.md §5.5) : `Pill` md, 24 px, pastille complète, 12/500,
 * marges 0 10 0 6 et écart 6 autour de l'icône de 16 px. Le libellé ne se coupe pas : c'est la ligne qui
 * passe à la suivante.
 */
export const STATUS_PILL =
  "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full pl-1.5 pr-2.5 text-caption";

/** Tonalités partagées par `ValidationStatus`, `DeliverableStatus` et `LifecycleStatus` (couleurs de §2.2). */
export const STATUS_TONE = {
  validated: PILL_TONE.success,
  pending: PILL_TONE.warning,
  revise: PILL_TONE.danger,
  unsubmitted: "bg-secondary text-muted-foreground",
  neutral: PILL_TONE.neutral,
} as const;
