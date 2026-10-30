import { z } from "zod";
import { instantSchema, pageInputSchema, ticketKeySchema } from "./schemas-tickets.ts";

export const commentTargetKindSchema = z.enum(["ticket", "feature", "screen", "change_request"]);
export const commentAuthorKindSchema = z.enum(["human", "agent", "client", "system"]);
export const auditActorKindSchema = z.enum(["human", "agent", "runner", "system"]);

/** 8 000 caractères : borne de réinjection d'un commentaire dans la session suivante (CDC §7.6). */
export const COMMENT_BODY_MAX = 8000;

export const commentSchema = z.object({
  id: z.uuid(),
  targetKind: commentTargetKindSchema,
  targetId: z.uuid(),
  authorKind: commentAuthorKindSchema,
  /** Null pour un commentaire système (aucun auteur). */
  authorId: z.string().min(1).nullable(),
  body: z.string(),
  createdAt: instantSchema,
});

/** L'auteur est déduit du jeton : il n'est jamais lu dans l'entrée. */
export const commentCreateInputSchema = z.object({
  targetKind: commentTargetKindSchema,
  targetId: z.uuid(),
  body: z.string().min(1).max(COMMENT_BODY_MAX),
});
export const commentListInputSchema = z.object({
  targetKind: commentTargetKindSchema,
  targetId: z.uuid(),
  ...pageInputSchema,
});
export const commentIdInputSchema = z.object({ id: z.uuid() });

export const projectStateSchema = z.object({
  version: z.number().int().min(1),
  content: z.record(z.string(), z.unknown()),
});
export const projectStateUpdateInputSchema = z.object({
  expectedVersion: z.number().int().min(1),
  content: z.record(z.string(), z.unknown()),
});

/** Le titulaire du bail est déduit du jeton : il n'est jamais lu dans l'entrée. */
export const leaseAcquireInputSchema = z.object({
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
  ticketKey: ticketKeySchema.optional(),
  actorKind: auditActorKindSchema.optional(),
  action: z.string().min(1).optional(),
  from: instantSchema.optional(),
  to: instantSchema.optional(),
  ...pageInputSchema,
});
