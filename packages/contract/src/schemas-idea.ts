import { z } from "zod";
import { specBatchSubmitInputSchema } from "./schemas-spec.ts";

/**
 * Espace Idée (TK-89, contrat 2.4.0). Bornes miroirs de `@koklo/domain` (`IDEA_*`) : le contrat ne
 * dépend pas du domaine. Jamais d'identifiant d'utilisateur ni d'e-mail en sortie : l'auteur d'une
 * modification est un nom et un indicateur « client ».
 */
export const IDEA_CONTENT_MAX = 50_000;
export const IDEA_TITLE_MAX = 120;
export const IDEA_PAGE_LIMIT = 50;

export const ideaPageStatusSchema = z.enum(["empty", "draft", "review", "stable"]);
export const ideaPageOriginSchema = z.enum(["template", "user", "agent"]);
/** Statuts posables à la main : « vide » se déduit du contenu. */
export const ideaSettableStatusSchema = z.enum(["draft", "review", "stable"]);

const ideaTitleSchema = z.string().trim().min(1).max(IDEA_TITLE_MAX);
const scoped = { projectId: z.uuid() } as const;
const pageScoped = { ...scoped, pageId: z.uuid() } as const;

export const ideaAuthorSchema = z.object({ name: z.string(), isClient: z.boolean() });

/** Une page sans son contenu : la liste n'en charge jamais. */
export const ideaPageSummarySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  position: z.number().int().min(0),
  required: z.boolean(),
  origin: ideaPageOriginSchema,
  status: ideaPageStatusSchema,
  version: z.number().int().min(1),
  updatedAt: z.iso.datetime(),
  updatedBy: ideaAuthorSchema.nullable(),
  deletedAt: z.iso.datetime().nullable(),
});

export const ideaPageSchema = ideaPageSummarySchema.extend({ contentMd: z.string() });

export const ideaListInputSchema = z.object(scoped);
export const ideaListOutputSchema = z.object({
  pages: z.array(ideaPageSummarySchema),
  trash: z.array(ideaPageSummarySchema),
  total: z.number().int().min(0),
  publication: z.object({
    available: z.boolean(),
    last: z.object({ commitSha: z.string(), publishedAt: z.iso.datetime() }).nullable(),
  }),
});

export const ideaGetInputSchema = z.object(pageScoped);

export const ideaSaveInputSchema = z.object({
  ...pageScoped,
  baseVersion: z.number().int().min(1),
  contentMd: z.string().max(IDEA_CONTENT_MAX),
});

export const ideaSetStatusInputSchema = z.object({
  ...pageScoped,
  status: ideaSettableStatusSchema,
});

export const ideaPublishInputSchema = z.object({
  ...scoped,
  idempotencyKey: specBatchSubmitInputSchema.shape.idempotencyKey,
});
export const ideaPublishOutputSchema = z.object({ batchId: z.uuid() });

export const ideaPresenceInputSchema = z.object({ ...scoped, pageId: z.uuid().nullish() });
export const ideaPresenceOutputSchema = z.object({
  present: z.array(
    z.object({
      initials: z.string(),
      name: z.string(),
      isClient: z.boolean(),
      pageId: z.uuid().nullable(),
      mine: z.boolean(),
    }),
  ),
});

export const ideaPageCreateInputSchema = z.object({
  ...scoped,
  title: ideaTitleSchema,
  afterPageId: z.uuid().optional(),
});
export const ideaPageRenameInputSchema = z.object({ ...pageScoped, title: ideaTitleSchema });
export const ideaPageReorderInputSchema = z.object({
  ...scoped,
  pageIds: z.array(z.uuid()).min(1).max(IDEA_PAGE_LIMIT),
});
export const ideaPageReorderOutputSchema = z.object({ pages: z.array(ideaPageSummarySchema) });
export const ideaPageRefInputSchema = z.object(pageScoped);
