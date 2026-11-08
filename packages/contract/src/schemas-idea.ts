import { z } from "zod";
import { listInputShape, listOf } from "./schemas-lists.ts";
import { specBatchSubmitInputSchema } from "./schemas-spec.ts";

/**
 * Espace Idée (TK-89, contrat 2.4.0 ; agent TK-90, contrat 2.5.0). Bornes miroirs de `@koklo/domain` (`IDEA_*`) : le contrat ne
 * dépend pas du domaine. Jamais d'identifiant d'utilisateur ni d'e-mail en sortie : l'auteur d'une
 * modification est un nom et un indicateur « client ».
 */
export const IDEA_CONTENT_MAX = 50_000;
export const IDEA_TITLE_MAX = 120;
export const IDEA_PAGE_LIMIT = 50;
export const IDEA_MESSAGE_MAX = 4000;
export const IDEA_RATIONALE_MAX = 200;

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

/** Opération d'une proposition : le Markdown n'a pas d'identifiant de bloc, on vise un rang (TK-90, B222). */
export const ideaProposalOpSchema = z.enum(["insert_after", "replace", "append", "create_page"]);
export const ideaProposalStatusSchema = z.enum(["pending", "accepted", "rejected", "stale"]);
export const ideaMessageModeSchema = z.enum(["interview", "free"]);

/**
 * Proposition de l'agent. `anchorBlockIndex` et `rangeEnd` : rang du bloc de premier niveau de `contentMd` à
 * `baseVersion` (jamais un identifiant). Une proposition de page (`create_page`) n'a ni page ni version.
 */
export const ideaProposalSchema = z.object({
  id: z.uuid(),
  messageId: z.uuid(),
  pageId: z.uuid().nullable(),
  op: ideaProposalOpSchema,
  anchorBlockIndex: z.number().int().min(0).nullable(),
  rangeEnd: z.number().int().min(0).nullable(),
  title: z.string().nullable(),
  afterPageId: z.uuid().nullable(),
  contentMd: z.string(),
  rationale: z.string(),
  baseVersion: z.number().int().min(1).nullable(),
  status: ideaProposalStatusSchema,
  createdAt: z.iso.datetime(),
});

/** Page de l'arborescence : le nombre de propositions en attente nourrit la pastille. */
export const ideaListedPageSchema = ideaPageSummarySchema.extend({
  pendingProposals: z.number().int().min(0),
});

export const ideaListInputSchema = z.object(scoped);
export const ideaListOutputSchema = z.object({
  pages: z.array(ideaListedPageSchema),
  trash: z.array(ideaPageSummarySchema),
  total: z.number().int().min(0),
  publication: z.object({
    available: z.boolean(),
    last: z.object({ commitSha: z.string(), publishedAt: z.iso.datetime() }).nullable(),
  }),
  pendingPageProposals: z.array(ideaProposalSchema),
});

/** Une page ouverte : son contenu et les propositions en attente sur elle. */
export const ideaPageDetailSchema = ideaPageSchema.extend({
  proposals: z.array(ideaProposalSchema),
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

export const ideaProposalRefInputSchema = z.object({ ...scoped, proposalId: z.uuid() });
export const ideaProposalDecideInputSchema = ideaProposalRefInputSchema.extend({
  decision: z.enum(["accept", "reject"]),
  /** Texte modifié par l'humain avant d'accepter (« Modifier ») ; remplace celui de l'agent. */
  contentMd: z.string().max(IDEA_CONTENT_MAX).optional(),
});
/** `page` : la page modifiée ou créée (accepter, annuler), `null` pour un rejet. */
export const ideaProposalOutputSchema = z.object({
  proposal: ideaProposalSchema,
  page: ideaPageSchema.nullable(),
});

/** Fil de l'agent : l'auteur humain est un nom et un indicateur client, l'agent n'en a pas (`null`). */
export const ideaMessageSchema = z.object({
  id: z.uuid(),
  pageId: z.uuid().nullable(),
  author: ideaAuthorSchema.nullable(),
  mode: ideaMessageModeSchema,
  text: z.string(),
  createdAt: z.iso.datetime(),
});
export const ideaMessageListInputSchema = z.object({
  ...scoped,
  ...listInputShape(z.string().min(1)),
});
export const ideaMessageListOutputSchema = listOf(ideaMessageSchema);

export const ideaAgentStatusInputSchema = z.object(scoped);
export const ideaAgentStatusOutputSchema = z.object({
  configured: z.boolean(),
  canConfigure: z.boolean(),
});
