import { z } from "zod";
import { memberRoleSchema, roleSchema } from "./schemas.ts";
import { pageNumberInputSchema, pageNumberOf } from "./schemas-lists.ts";

/**
 * Réglages (TK-97, contrat 2.2.0). Ajouts seulement : `member.invite|setRole|list` restent, dépréciées
 * (B95). Les compteurs de Général sont réels ; le nombre de clés d'IA ne nomme jamais le fournisseur.
 */

const projectRefSchema = z.object({ id: z.uuid(), name: z.string() });
const ISO = z.iso.datetime();

export const orgGetOutputSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  logo: z.string().nullable(),
  projectCount: z.number().int().min(0),
  memberCount: z.number().int().min(0),
  aiProviderCount: z.number().int().min(0),
});

export const orgUpdateInputSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9-]+$/),
});
export const orgUpdateOutputSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
});

/** Plafond de projets proposés à une invitation (un client en suit rarement plus). */
export const INVITATION_PROJECTS_MAX = 50;

export const invitationCreateInputSchema = z.object({
  email: z.email(),
  role: memberRoleSchema,
  projectIds: z.array(z.uuid()).max(INVITATION_PROJECTS_MAX).optional(),
});
export const invitationSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: memberRoleSchema,
  status: z.literal("pending"),
  expiresAt: ISO,
  invitedBy: z.string(),
  projects: z.array(projectRefSchema),
});
export const invitationListOutputSchema = z.array(invitationSchema);
export const invitationIdInputSchema = z.object({ invitationId: z.uuid() });
export const invitationRevokeOutputSchema = z.object({ id: z.uuid() });

export const memberPageInputSchema = pageNumberInputSchema;
export const memberPageRowSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: roleSchema,
  /** Projets liés (client et business) ; vide pour les autres rôles. Toujours de l'organisation. */
  projects: z.array(projectRefSchema),
  /** Session la plus récente du membre (B102) ; `null` s'il ne s'est jamais connecté. */
  lastActiveAt: ISO.nullable(),
});
export const memberPageOutputSchema = pageNumberOf(memberPageRowSchema);

export const memberUpdateRoleInputSchema = z.object({ memberId: z.uuid(), role: memberRoleSchema });
export const memberUpdateRoleOutputSchema = z.object({ id: z.uuid(), role: memberRoleSchema });
export const memberRemoveInputSchema = z.object({ memberId: z.uuid() });
export const memberRemoveOutputSchema = z.object({ id: z.uuid() });

/** Clés de « Me prévenir par e-mail » (B101) : liste FERMÉE, aussi imposée par un CHECK en base. */
export const NOTIFICATION_PREFERENCE_KEYS = [
  "client_validation",
  "pr_to_review",
  "agent_silent",
  "ai_budget",
  "weekly_digest",
  "deliverable_to_validate",
  "feature_ready",
  "comment_reply",
] as const;
export const notificationPreferenceKeySchema = z.enum(NOTIFICATION_PREFERENCE_KEYS);
export type NotificationPreferenceKey = z.output<typeof notificationPreferenceKeySchema>;

/** Valeur en l'absence de ligne : tout est activé sauf le résumé de la semaine (passation 19 §2.6). */
export const DEFAULT_NOTIFICATION_PREFERENCES: Readonly<
  Record<NotificationPreferenceKey, boolean>
> = {
  client_validation: true,
  pr_to_review: true,
  agent_silent: true,
  ai_budget: true,
  weekly_digest: false,
  deliverable_to_validate: true,
  feature_ready: true,
  comment_reply: true,
};

/** Clés proposées au client ; les autres rôles reçoivent les cinq autres. */
export const CLIENT_NOTIFICATION_KEYS: readonly NotificationPreferenceKey[] = [
  "deliverable_to_validate",
  "feature_ready",
  "comment_reply",
];
export const TEAM_NOTIFICATION_KEYS: readonly NotificationPreferenceKey[] =
  NOTIFICATION_PREFERENCE_KEYS.filter((key) => !CLIENT_NOTIFICATION_KEYS.includes(key));

export const meOutputSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: roleSchema,
});
export const meUpdateInputSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const meNotificationsOutputSchema = z.array(
  z.object({ key: notificationPreferenceKeySchema, enabled: z.boolean() }),
);
export const meUpdateNotificationInputSchema = z.object({
  key: notificationPreferenceKeySchema,
  enabled: z.boolean(),
});
export const meUpdateNotificationOutputSchema = meUpdateNotificationInputSchema;
