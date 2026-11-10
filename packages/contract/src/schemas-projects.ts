import { z } from "zod";
import { LIST_QUERY_MAX_LENGTH } from "./schemas-lists.ts";
import { projectPhaseSchema } from "./schemas-shell.ts";

/**
 * Liste des projets en cartes et création en une étape (TK-93, contrat 2.8.0, additif).
 * Tout est calculé côté serveur : filtres, tri, facettes, total, textes d'avancement. Un client ne
 * reçoit que ses projets, avec des libellés tournés vers lui (`audience`).
 */

/** Une page de cartes : 24 au plus (B300, pas de virtualisation). */
export const PROJECT_CARDS_PAGE_SIZE = 24;

export const projectCardsSortSchema = z.enum(["activity", "name", "attention"]);

export const projectCardsInputSchema = z.object({
  q: z.string().min(1).max(LIST_QUERY_MAX_LENGTH).optional(),
  phase: projectPhaseSchema.optional(),
  sort: projectCardsSortSchema.optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(PROJECT_CARDS_PAGE_SIZE).optional(),
});

/** Teinte de la tuile d'un projet : `--hue-1..5` (domaine : `projectTileOf`). */
export const projectColorKeySchema = z.number().int().min(1).max(5);

/** Statut d'une création de projet (ligne `project_creations`). */
export const creationStatusKindSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
]);

export const CREATION_STEP_KEYS = ["project", "idea", "invitation", "repo"] as const;
export const creationStepSchema = z.object({
  key: z.enum(CREATION_STEP_KEYS),
  /** `status` et non `state` : `state` figure parmi les noms interdits du contrat (no-secrets.test.ts). */
  status: z.enum(["done", "running", "todo", "error"]),
  detail: z.string().optional(),
});

/** Codes d'échec de création : liste fermée, jamais un message du fournisseur. */
export const CREATION_ERROR_CODES = [
  "no_account",
  "name_taken",
  "user_token_required",
  "auth_expired_user",
  "auth_expired_installation",
  "resource_not_accessible",
  "provider_unavailable",
  "rate_limited",
  "account_unavailable",
  "invalid_name",
  "forbidden",
  "unknown",
] as const;
export const creationErrorCodeSchema = z.enum(CREATION_ERROR_CODES);

export const creationStatusSchema = z.object({
  status: creationStatusKindSchema,
  steps: z.array(creationStepSchema),
  ideaPages: z.number().int().min(0),
  error: z
    .object({
      code: creationErrorCodeSchema,
      ownerLogin: z.string().optional(),
      repoName: z.string().optional(),
      retryAfterMs: z.number().int().min(0).optional(),
    })
    .optional(),
  /** Vrai pour owner et admin : eux seuls peuvent relancer la création du dépôt. */
  canAct: z.boolean(),
});

export const projectCardPersonSchema = z.object({
  initials: z.string(),
  name: z.string(),
  client: z.boolean(),
});

export const projectCardSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  initials: z.string(),
  colorKey: projectColorKeySchema,
  clientContact: z.string().nullable(),
  phase: projectPhaseSchema,
  progress: z.object({
    label: z.string(),
    done: z.number().int().min(0),
    total: z.number().int().min(0),
    valueLabel: z.string(),
  }),
  nextAction: z.object({ title: z.string(), attention: z.boolean() }).nullable(),
  people: z.array(projectCardPersonSchema).max(3),
  lastActivity: z.object({ actor: z.string().nullable(), at: z.iso.datetime() }).nullable(),
  creation: creationStatusSchema.nullable(),
});

export const projectCardsOutputSchema = z.object({
  items: z.array(projectCardSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().min(0),
  facets: z.object({
    all: z.number().int().min(0),
    idea: z.number().int().min(0),
    framing: z.number().int().min(0),
    iterations: z.number().int().min(0),
  }),
  /** Projets dont la prochaine étape demande de l'attention, avant filtre de phase. */
  attention: z.number().int().min(0),
  audience: z.enum(["team", "client"]),
});

const projectIdInput = z.object({ projectId: z.uuid() });
export const projectCreationStatusInputSchema = projectIdInput;
export const projectCreationStatusOutputSchema = creationStatusSchema.nullable();

export const projectRetryRepoInputSchema = projectIdInput.extend({
  repoName: z.string().min(1).max(100).optional(),
  installationId: z.uuid().optional(),
});

export const projectSetEuOnlyInputSchema = projectIdInput.extend({ euOnly: z.boolean() });
export const projectSetEuOnlyOutputSchema = z.object({ euOnly: z.boolean() });

export type ProjectCardsInput = z.input<typeof projectCardsInputSchema>;
export type ProjectCardsOutput = z.output<typeof projectCardsOutputSchema>;
export type ProjectCard = z.output<typeof projectCardSchema>;
export type CreationStatus = z.output<typeof creationStatusSchema>;
export type CreationErrorCode = (typeof CREATION_ERROR_CODES)[number];
