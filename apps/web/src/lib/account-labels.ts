import type { NotificationPreferenceKey } from "@koklo/contract";

/** Libellés de « Me prévenir par e-mail » (S-settings §3), un par clé fermée du contrat. */
export const NOTIFICATION_LABELS: Record<NotificationPreferenceKey, string> = {
  client_validation: "Validation ou changement d'un client",
  pr_to_review: "Pull request à relire",
  agent_silent: "Agent sans nouvelles depuis 20 minutes",
  ai_budget: "Consommation d'IA à 80 %",
  weekly_digest: "Résumé de la semaine",
  deliverable_to_validate: "Livrable ou écran à valider",
  feature_ready: "Fonctionnalité prête à essayer",
  comment_reply: "Réponse à un commentaire",
};

/** La consommation d'IA ne prévient que le propriétaire : aucun interrupteur sans effet pour les autres. */
export const OWNER_ONLY_KEYS: readonly NotificationPreferenceKey[] = ["ai_budget"];

export const THEME_CHOICES = [
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
  { value: "system", label: "Système" },
] as const;
