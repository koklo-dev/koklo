import { z } from "zod";
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
]);
export const commentAuthorKindSchema = z.enum(["human", "agent", "client", "system"]);
export const auditActorKindSchema = z.enum(["human", "agent", "runner", "system"]);

/** 8 000 caractères : borne de réinjection d'un commentaire dans la session suivante (CDC §7.6). */
export const COMMENT_BODY_MAX = 8000;

export const commentSchema = z.object({
  id: z.uuid(),
  targetKind: commentTargetKindSchema,
  /** Pour une table de données : le projet (la table est repérée par `targetRef`). */
  targetId: z.uuid(),
  /** `T-<slug>` d'un commentaire de table (3.7.0) ; absent pour un ticket. */
  targetRef: tableIdSchema.optional(),
  authorKind: commentAuthorKindSchema,
  /** Null pour un commentaire système (aucun auteur). */
  authorId: z.string().min(1).nullable(),
  body: z.string(),
  createdAt: instantSchema,
});

/** Une cible `table` se désigne par `targetRef` (`T-<slug>`), les autres par `targetId` seul (3.7.0). */
const targetShape = {
  targetKind: commentTargetKindSchema,
  targetId: z.uuid().optional(),
  targetRef: tableIdSchema.optional(),
};
const hasCoherentTarget = (input: {
  targetKind: string;
  targetId?: string | undefined;
  targetRef?: string | undefined;
}) =>
  input.targetKind === "table"
    ? input.targetRef !== undefined
    : input.targetId !== undefined && input.targetRef === undefined;
const TARGET_MESSAGE = {
  message: "table exige targetRef ; les autres cibles exigent targetId seul",
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
