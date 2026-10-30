import { z } from "zod";
import { instantSchema } from "./schemas-tickets.ts";

/** Valeurs littérales identiques à celles du domaine et de la base (parité vérifiée par apps/api/test). */
export const repoRoleSchema = z.enum(["spec", "front", "back", "monorepo", "mobile"]);
export const repoModeSchema = z.enum(["new", "adopted"]);
export const ownerKindSchema = z.enum(["organization", "user"]);
export const installationStatusSchema = z.enum(["active", "suspended", "deleted"]);
/** État de l'autorisation utilisateur : jamais le jeton lui-même. */
export const userAuthorizationSchema = z.enum(["absent", "active", "expired"]);

/** Le contrat n'expose pas l'identifiant externe de l'installation ni aucun secret. */
export const installationSchema = z.object({
  id: z.uuid(),
  provider: z.literal("github"),
  ownerKind: ownerKindSchema,
  ownerLogin: z.string().min(1),
  status: installationStatusSchema,
  userAuthorization: userAuthorizationSchema,
  createdAt: instantSchema,
});
export const installationListOutputSchema = z.array(installationSchema);

/** Absent : installation nouvelle ; présent : ré-autorisation de l'utilisateur pour cette installation. */
export const installationStartInputSchema = z.object({ installationId: z.uuid().optional() });
/** L'URL porte un `state` signé à usage unique ; il n'est pas exposé séparément. */
export const installationStartOutputSchema = z.object({ url: z.url(), expiresAt: instantSchema });

export const repoSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  installationId: z.uuid(),
  role: repoRoleSchema,
  mode: repoModeSchema,
  ownerLogin: z.string().min(1),
  name: z.string().min(1),
  defaultBranch: z.string().min(1),
  specPath: z.string().nullable(),
});
export const repoListInputSchema = z.object({ projectId: z.uuid() });
export const repoListOutputSchema = z.array(repoSchema);

/** Lie un dépôt existant (`mode: adopted`), y compris le repli « dépôt de spec créé à la main ». */
export const repoLinkInputSchema = z.object({
  projectId: z.uuid(),
  installationId: z.uuid(),
  role: repoRoleSchema,
  ownerLogin: z.string().min(1),
  name: z.string().min(1),
  specPath: z.string().min(1).optional(),
});
/** Le dépôt de spec est toujours privé : aucune visibilité en entrée. */
export const repoCreateSpecInputSchema = z.object({
  projectId: z.uuid(),
  installationId: z.uuid(),
  name: z.string().min(1).optional(),
});

/**
 * Callback GitHub (redirection navigateur, hors oRPC et hors OpenAPI) : requête reçue et résultat
 * transmis au web dans la redirection.
 */
export const installationCallbackQuerySchema = z.object({
  installation_id: z.string().min(1),
  state: z.string().min(1),
  code: z.string().min(1).optional(),
  setup_action: z.string().min(1).optional(),
});
export const installationCallbackOutcomeSchema = z.enum([
  "installed",
  "denied",
  "invalid_state",
  "already_linked",
  "provider_error",
]);
