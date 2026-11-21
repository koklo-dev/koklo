import { z } from "zod";
import { adrIdSchema, archFlowIdSchema, componentIdSchema } from "./schemas-spec-architecture.ts";
import { tableIdSchema } from "./schemas-spec-data.ts";
import {
  instantSchema,
  pageInputSchema,
  projectScopeShape,
  ticketKeySchema,
} from "./schemas-tickets.ts";

export const commentTargetKindSchema = z.enum([
  "ticket",
  "feature",
  "screen",
  "change_request",
  "table",
  "component",
  "adr",
  "archflow",
]);
export const commentAuthorKindSchema = z.enum(["human", "agent", "client", "system"]);
export const auditActorKindSchema = z.enum(["human", "agent", "runner", "system"]);

/** 8 000 caractères : borne de réinjection d'un commentaire dans la session suivante (CDC §7.6). */
export const COMMENT_BODY_MAX = 8000;

/** Cibles désignées par `targetRef` : leur identifiant lisible, vérifié contre le genre (le projet est `targetId`). */
const REF_KINDS = ["table", "component", "adr", "archflow"] as const;
const REF_SCHEMA = {
  table: tableIdSchema,
  component: componentIdSchema,
  adr: adrIdSchema,
  archflow: archFlowIdSchema,
} as const;
const targetRefSchema = z.union([tableIdSchema, componentIdSchema, adrIdSchema, archFlowIdSchema]);

export const commentSchema = z.object({
  id: z.uuid(),
  targetKind: commentTargetKindSchema,
  /** Pour une table de données : le projet (la table est repérée par `targetRef`). */
  targetId: z.uuid(),
  /** `T-<slug>` (table, 3.7.0), `C-<slug>` (composant), `ADR-<nnn>` (décision) ou `P-<slug>` (flux) en 3.11.0 ; absent pour un ticket. */
  targetRef: targetRefSchema.optional(),
  authorKind: commentAuthorKindSchema,
  /** Null pour un commentaire système (aucun auteur). */
  authorId: z.string().min(1).nullable(),
  body: z.string(),
  createdAt: instantSchema,
});

/** Une cible `table`, `component`, `adr` ou `archflow` se désigne par `targetRef`, les autres par `targetId` seul (3.7.0, 3.11.0). */
const targetShape = {
  targetKind: commentTargetKindSchema,
  targetId: z.uuid().optional(),
  targetRef: targetRefSchema.optional(),
};
const hasCoherentTarget = (input: {
  targetKind: string;
  targetId?: string | undefined;
  targetRef?: string | undefined;
}) => {
  const schema = REF_SCHEMA[input.targetKind as (typeof REF_KINDS)[number]];
  if (schema === undefined) return input.targetId !== undefined && input.targetRef === undefined;
  return input.targetRef !== undefined && schema.safeParse(input.targetRef).success;
};
const TARGET_MESSAGE = {
  message:
    "table, component, adr et archflow exigent targetRef de leur forme ; les autres cibles exigent targetId seul",
  path: ["targetRef"],
};

/** L'auteur est déduit du jeton : il n'est jamais lu dans l'entrée. */
export const commentCreateInputSchema = z
  .object({
    ...projectScopeShape,
    ...targetShape,
    body: z.string().min(1).max(COMMENT_BODY_MAX),
  })
  .refine(hasCoherentTarget, TARGET_MESSAGE);
export const commentListInputSchema = z
  .object({ ...projectScopeShape, ...targetShape, ...pageInputSchema })
  .refine(hasCoherentTarget, TARGET_MESSAGE);
/** Sortie de `comment.delete` : l'identifiant seul, sans le projet. */
export const commentIdOutputSchema = z.object({ id: z.uuid() });
export const commentIdInputSchema = z.object({
  ...projectScopeShape,
  ...commentIdOutputSchema.shape,
});

export const projectStateSchema = z.object({
  version: z.number().int().min(1),
  content: z.record(z.string(), z.unknown()),
});
export const projectStateInputSchema = z.object(projectScopeShape);
export const projectStateUpdateInputSchema = z.object({
  ...projectScopeShape,
  expectedVersion: z.number().int().min(1),
  content: z.record(z.string(), z.unknown()),
});

/** Le titulaire du bail est déduit du jeton : il n'est jamais lu dans l'entrée. */
export const leaseAcquireInputSchema = z.object({
  ...projectScopeShape,
  key: ticketKeySchema,
  branch: z.string().min(1),
  worktree: z.string().min(1),
  ttlMs: z.number().int().positive().optional(),
});

export const auditEntrySchema = z.object({
  id: z.uuid(),
  actorKind: auditActorKindSchema,
  actorId: z.string().optional(),
  tokenId: z.string().optional(),
  action: z.string().min(1),
  targetKind: z.string().min(1),
  targetId: z.uuid(),
  ticketKey: ticketKeySchema.optional(),
  occurredAt: instantSchema,
});
export const auditListInputSchema = z.object({
  ...projectScopeShape,
  ticketKey: ticketKeySchema.optional(),
  actorKind: auditActorKindSchema.optional(),
  action: z.string().min(1).optional(),
  from: instantSchema.optional(),
  to: instantSchema.optional(),
  ...pageInputSchema,
});
