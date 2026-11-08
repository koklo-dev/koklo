import type { NotificationPreferenceKey } from "@koklo/contract";

/** Libellés de « Me prévenir par e-mail » (S-settings §3), un par clé fermée du contrat. */
export const NOTIFICATION_LABELS: Record<NotificationPreferenceKey, string> = {
  client_validation: "Le client valide ou demande un changement",
  pr_to_review: "Une pull request attend ma revue",
  agent_silent: "Un agent n'a plus donné de nouvelles depuis 20 min",
  ai_budget: "La consommation d'IA atteint 80 % du plafond",
  weekly_digest: "Résumé de la semaine",
  deliverable_to_validate: "Un livrable ou un écran attend ma validation",
  feature_ready: "Une fonctionnalité est prête à essayer",
  comment_reply: "L'équipe répond à mon commentaire",
};

/** La consommation d'IA ne prévient que le propriétaire : aucun interrupteur sans effet pour les autres. */
export const OWNER_ONLY_KEYS: readonly NotificationPreferenceKey[] = ["ai_budget"];

export const THEME_CHOICES = [
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
  { value: "system", label: "Système" },
] as const;
