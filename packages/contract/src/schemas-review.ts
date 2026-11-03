import { z } from "zod";
import { roleSchema } from "./schemas.ts";
import { clientValidationSchema } from "./schemas-client-space.ts";
import { commitShaSchema, featureIdSchema } from "./schemas-spec.ts";
import { CLEAN_MESSAGE, isCleanText } from "./schemas-suggestion.ts";
import { pageInputSchema, pageOf } from "./schemas-tickets.ts";

/** Taille maximale du commentaire d'une review et de la version opaque (TK-55d). */
export const REVIEW_COMMENT_MAX = 2000;
export const REVIEW_VERSION_MAX = 256;

export const reviewTargetKindSchema = z.enum(["feature", "baseline"]);
export const reviewStatusSchema = z.enum(["approved", "changes_requested"]);
export const baselineRefSchema = z.string().regex(/^baseline-(0|[1-9]\d*)$/);

const REF_BY_KIND = { feature: featureIdSchema, baseline: baselineRefSchema } as const;

/**
 * Le client valide une cible liée à la `version` qu'il a lue : jeton opaque, aucune forme imposée
 * (une version illisible devient `STALE_VERSION` côté API, sans oracle). Le SHA retenu, l'auteur, son
 * rôle, le dépôt et l'organisation sont posés par le serveur, jamais lus de l'entrée.
 */
export const reviewSubmitInputSchema = z
  .object({
    projectId: z.uuid(),
    targetKind: reviewTargetKindSchema,
    targetRef: z.string().min(1).max(64),
    version: z.string().min(1).max(REVIEW_VERSION_MAX),
    status: reviewStatusSchema,
    comment: z.string().max(REVIEW_COMMENT_MAX).refine(isCleanText, CLEAN_MESSAGE).optional(),
  })
  .refine((value) => REF_BY_KIND[value.targetKind].safeParse(value.targetRef).success, {
    message: "targetRef ne correspond pas à la cible",
    path: ["targetRef"],
  });

export const reviewSubmitOutputSchema = z.object({
  id: z.uuid(),
  status: reviewStatusSchema,
  validation: clientValidationSchema,
  createdAt: z.iso.datetime(),
});

export const reviewListInputSchema = z.object({
  projectId: z.uuid(),
  targetKind: reviewTargetKindSchema.optional(),
  targetRef: z.string().min(1).max(64).optional(),
  ...pageInputSchema,
});

/** Preuve technique pour l'équipe : le SHA exact validé, l'auteur et son rôle, `current` si c'est la tête. */
export const reviewSchema = z.object({
  id: z.uuid(),
  targetKind: reviewTargetKindSchema,
  targetRef: z.string(),
  sha: commitShaSchema,
  status: reviewStatusSchema,
  authorId: z.uuid(),
  authorRole: roleSchema.nullable(),
  comment: z.string().nullable(),
  createdAt: z.iso.datetime(),
  current: z.boolean(),
});

export const reviewListOutputSchema = pageOf(reviewSchema);
