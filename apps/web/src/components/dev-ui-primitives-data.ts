import type { IconName } from "@koklo/ui";

/** Rôles de texte ajoutés par TK-138 (DESIGN.md §5.5) : classe, taille / graisse, exemple. */
export const TEXT_ROLES = [
  { className: "text-card-title", spec: "15 / 600", sample: "Titre de carte" },
  { className: "text-dialog-title", spec: "18 / 600", sample: "Titre de dialogue" },
  { className: "text-stat", spec: "24 / 600", sample: "1 284" },
  { className: "text-count", spec: "11 / 600", sample: "12" },
  { className: "text-code-sm font-mono", spec: "11 / 500", sample: "TK-138" },
  { className: "text-settings-title", spec: "20 / 600", sample: "Réglages de l'organisation" },
] as const;

/** Ombres et rayons ajoutés par TK-138 : classe d'exemple et légende. */
export const ELEVATIONS = [
  { className: "shadow-dialog rounded-dialog", label: "Dialogue · ombre et rayon 14" },
  { className: "shadow-sheet rounded-card", label: "Panneau latéral · ombre" },
  { className: "shadow-toast rounded-card", label: "Notification · ombre et rayon 10" },
] as const;

export const ICON_SIZES = [14, 16, 18, 20, 22, 24, 28] as const;

export const ICON_TONES = [
  { tone: "muted", label: "muted" },
  { tone: "primary", label: "primary" },
  { tone: "success", label: "success" },
  { tone: "danger", label: "danger" },
] as const;

/** Les 21 glyphes ajoutés au registre par TK-138 (wand_stars = icône d'un agent IA). */
export const NEW_ICONS: readonly IconName[] = [
  "wand_stars",
  "progress_activity",
  "check_box",
  "check_box_outline_blank",
  "content_copy",
  "swap_horiz",
  "person_add",
  "schedule_send",
  "widgets",
  "cloud_done",
  "apartment",
  "groups",
  "key",
  "badge",
  "sync_problem",
  "arrow_forward",
  "admin_panel_settings",
  "speed",
  "description",
  "subdirectory_arrow_right",
  "keyboard_arrow_down",
];
