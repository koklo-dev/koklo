import { z } from "zod";
import { AROUND_WITH_CURSOR_MESSAGE, listInputShape, noAroundWithCursor } from "./schemas-lists.ts";
import {
  DOMAIN_OPERATION_KINDS,
  flowCreateSchema,
  flowDeleteSchema,
  flowDetailSchema,
  flowIdSchema,
  flowUpdateSchema,
  roleCreateSchema,
  roleDeleteSchema,
  roleDetailSchema,
  roleIdSchema,
  roleUpdateSchema,
  ruleCreateSchema,
  ruleDeleteSchema,
  ruleDetailSchema,
  ruleIdSchema,
  ruleUpdateSchema,
  specIdSchema,
} from "./schemas-spec-domain.ts";
import { instantSchema } from "./schemas-tickets.ts";

/** Valeurs et motifs identiques à ceux de @koklo/schema (parité vérifiée par apps/api/test). */
export const featureStatusSchema = z.enum(["brouillon", "specifiee", "implementee", "adoptee"]);
export const featurePrioritySchema = z.enum(["must", "should", "could", "wont"]);
export const stepTypeSchema = z.enum(["etant_donne", "quand", "alors", "et"]);
/** Mêmes valeurs que `clientValidationSchema` (schemas-client-space.ts, qui importe ce module : pas de cycle). */
export const featureValidationSchema = z.enum(["validated", "to_validate", "to_revise"]);
/** Zone du produit (texte brut, 1 à 80 caractères) : écrite dans le fichier de la fonctionnalité (3.0.0). */
export const FEATURE_ZONE_MAX_LENGTH = 80;
export const featureZoneSchema = z.string().min(1).max(FEATURE_ZONE_MAX_LENGTH);
export const specIndexStatusSchema = z.enum(["building", "ready", "failed"]);
export const specBatchStatusSchema = z.enum([
  "queued",
  "committing",
  "committed",
  "failed",
  "conflict",
]);
/** Types d'opérations d'un lot, tels que `specBatch.get` les rapporte : features (soumises) et pages d'idée (2.4.0, TK-89, produites par `idea.publish`), Synthèse et tag de version (2.6.0, TK-91, produits par `idea.freeze`). */
export const specOperationKindSchema = z.enum([
  "feature.create",
  "feature.update",
  "feature.delete",
  ...DOMAIN_OPERATION_KINDS,
  "idea.page.write",
  "idea.page.delete",
  "idea.index.write",
  "idea.synthesis.write",
  "idea.version.tag",
]);

const slug = "[a-z0-9][a-z0-9-]*";
export const featureIdSchema = z.string().regex(/^F-\d{3,}$/);
export const criterionIdSchema = z.string().regex(/^AC-\d+$/);
const tableLink = z.string().regex(new RegExp(`^T-${slug}$`));
const endpointLink = z.string().regex(new RegExp(`^E-${slug}$`));
const screenLink = z.string().regex(new RegExp(`^S-${slug}$`));
const roleLink = z.string().regex(new RegExp(`^RL-${slug}$`));
const ruleLink = z.string().regex(/^R-\d{3,}$/);
const nfrLink = z.string().regex(new RegExp(`^NFR-${slug}$`));

export const commitShaSchema = z.string().regex(/^[0-9a-f]{40}$/);
const branchSchema = z.string().min(1);
const titleSchema = z.string().min(1).max(200);

export const stepSchema = z.object({ type: stepTypeSchema, text: z.string().min(1) });

// --- Rapport de validation (miroir Zod du ValidationReport de @koklo/schema) ---
export const specIssueSchema = z.object({
  rule: z.union([z.literal(4), z.literal(5), z.literal(7), z.literal("structure")]),
  code: z.string().min(1),
  severity: z.enum(["error", "warning"]),
  path: z.string(),
  pointer: z.string(),
  entityId: z.string().optional(),
  message: z.string(),
});
/** Au plus 100 diagnostics ; `truncated` signale qu'il y en avait davantage. */
export const SPEC_REPORT_ISSUES_MAX = 100;
export const validationReportSchema = z.object({
  ok: z.boolean(),
  counts: z.object({ error: z.number().int().min(0), warning: z.number().int().min(0) }),
  truncated: z.boolean(),
  issues: z.array(specIssueSchema).max(SPEC_REPORT_ISSUES_MAX),
});

// --- Lecture (depuis l'index) ---
/** `branch` et `commitSha` sont exclusifs ; tous deux absents : la branche de travail du projet. */
const revisionFields = { branch: branchSchema.optional(), commitSha: commitShaSchema.optional() };
const exclusiveRevision = (value: { branch?: string; commitSha?: string }) =>
  value.branch === undefined || value.commitSha === undefined;
const REVISION_MESSAGE = "branch et commitSha sont exclusifs";

export const specHeadInputSchema = z
  .object({ projectId: z.uuid(), ...revisionFields })
  .refine(exclusiveRevision, REVISION_MESSAGE);
export const specHeadSchema = z
  .object({
    branch: z.string(),
    commitSha: commitShaSchema,
    status: specIndexStatusSchema,
    errorCode: z.string().nullable(),
    indexedAt: instantSchema,
    counts: z.object({
      features: z.number().int().min(0),
      tables: z.number().int().min(0),
      endpoints: z.number().int().min(0),
      /** Règles, rôles et parcours de la tête (3.1.0) : compteurs d'onglet et résumé d'en-tête. */
      rules: z.number().int().min(0),
      roles: z.number().int().min(0),
      flows: z.number().int().min(0),
    }),
  })
  .nullable();

export const featureListInputSchema = z
  .object({
    projectId: z.uuid(),
    status: featureStatusSchema.optional(),
    priority: featurePrioritySchema.optional(),
    validation: featureValidationSchema.optional(),
    ...revisionFields,
    ...listInputShape(featureIdSchema),
  })
  .refine(exclusiveRevision, REVISION_MESSAGE)
  .refine(noAroundWithCursor, AROUND_WITH_CURSOR_MESSAGE);
export const featureSummarySchema = z.object({
  specId: featureIdSchema,
  title: z.string(),
  status: featureStatusSchema,
  priority: featurePrioritySchema,
  filePath: z.string(),
  criteriaCount: z.number().int().min(0),
  validation: featureValidationSchema,
});

export const featureGetInputSchema = z.object({ projectId: z.uuid(), specId: featureIdSchema });
export const featureDetailSchema = z.object({
  specId: featureIdSchema,
  title: z.string(),
  status: featureStatusSchema,
  priority: featurePrioritySchema,
  description: z.string(),
  zone: featureZoneSchema.optional(),
  criteria: z.array(
    z.object({
      specId: criterionIdSchema,
      position: z.number().int().min(1),
      title: z.string(),
      steps: z.array(stepSchema),
    }),
  ),
  tables: z.array(tableLink),
  endpoints: z.array(endpointLink),
  screens: z.array(screenLink),
  roles: z.array(roleLink),
  rules: z.array(ruleLink),
  nfr: z.array(nfrLink),
  filePath: z.string(),
  commitSha: commitShaSchema,
});

// --- Écriture par lots ---
/** Champs modifiables d'une feature (l'identifiant F-nnn est attribué par le serveur à la création). */
const featureFields = {
  title: titleSchema,
  status: featureStatusSchema,
  priority: featurePrioritySchema,
  description: z.string(),
  zone: featureZoneSchema,
  criteria: z.array(z.object({ title: z.string().min(1), steps: z.array(stepSchema) })),
  tables: z.array(tableLink),
  endpoints: z.array(endpointLink),
  screens: z.array(screenLink),
  roles: z.array(roleLink),
  rules: z.array(ruleLink),
  nfr: z.array(nfrLink),
};
const optionalFeatureFields = z.object(featureFields).partial();

export const featureCreateSchema = optionalFeatureFields
  .required({ title: true, priority: true })
  .extend({ kind: z.literal("feature.create") });

const featureUpdateSchema = optionalFeatureFields
  .extend({ kind: z.literal("feature.update"), specId: featureIdSchema })
  .refine(
    (op) =>
      Object.keys(featureFields).some(
        (field) => field in op && op[field as keyof typeof op] !== undefined,
      ),
    "au moins un champ modifié",
  );

const featureDeleteSchema = z.object({
  kind: z.literal("feature.delete"),
  specId: featureIdSchema,
});

/** Fonctionnalités, règles, rôles et parcours (3.1.0) ; tables, endpoints, écrans : un nouveau `kind` sera un ajout mineur. */
export const specOperationSchema = z.discriminatedUnion("kind", [
  featureCreateSchema,
  featureUpdateSchema,
  featureDeleteSchema,
  ruleCreateSchema,
  ruleUpdateSchema,
  ruleDeleteSchema,
  roleCreateSchema,
  roleUpdateSchema,
  roleDeleteSchema,
  flowCreateSchema,
  flowUpdateSchema,
  flowDeleteSchema,
]);

/** 200 opérations par lot depuis 2.9.0 (TK-99a) : un groupe de propositions se soumet en un commit. */
export const SPEC_BATCH_OPERATIONS_MAX = 200;
export const SPEC_BATCH_PROPOSALS_MAX = 200;
/** L'auteur et les trailers du commit viennent de la session : jamais de l'entrée. */
export const specBatchSubmitInputSchema = z.object({
  projectId: z.uuid(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  branch: branchSchema.optional(),
  baseSha: commitShaSchema.optional(),
  message: z.string().max(200).optional(),
  operations: z.array(specOperationSchema).min(1).max(SPEC_BATCH_OPERATIONS_MAX),
  /** Preuve serveur que les opérations viennent de propositions acceptées du projet (TK-99a, 2.9.0). */
  proposalIds: z.array(z.uuid()).max(SPEC_BATCH_PROPOSALS_MAX).optional(),
});

/** Sans `authorUserId` : aucun identifiant interne d'utilisateur n'est exposé. */
export const specBatchSchema = z.object({
  id: z.uuid(),
  branch: z.string(),
  status: specBatchStatusSchema,
  idempotencyKey: z.string(),
  baseSha: commitShaSchema.nullable(),
  commitSha: commitShaSchema.nullable(),
  errorCode: z.string().nullable(),
  report: validationReportSchema.nullable(),
  results: z.array(
    z.object({
      position: z.number().int().min(0),
      kind: specOperationKindSchema,
      specId: specIdSchema.nullable(),
    }),
  ),
  enqueuedAt: instantSchema,
  committedAt: instantSchema.nullable(),
});
export const specBatchGetInputSchema = z.object({ projectId: z.uuid(), batchId: z.uuid() });

/**
 * Panneau d'édition d'un élément (TK-101, 2.11.0, B329 b, c, e) : la fonctionnalité, puis (3.1.0) la règle, le rôle et le
 * parcours. Les autres genres arriveront avec leurs formulaires.
 */
export const SPEC_REFS_MAX = 20;
export const specRefKindSchema = z.enum(["feature", "rule", "flow", "table", "endpoint", "screen"]);
/** Genres d'entités de l'index générique (`spec_entities`) : un élément peut en citer un autre quel que soit son genre. */
const specEntityKindSchema = z.enum([
  "feature",
  "rule",
  "roles",
  "flow",
  "relations",
  "table",
  "endpoint",
  "screen",
  "test",
]);
const refShape = { specId: z.string().min(1).max(100), title: z.string().max(300) };
export const specRefSchema = z.object({ kind: specRefKindSchema, ...refShape });

export const SPEC_ITEM_TYPES = ["feature", "rule", "role", "flow"] as const;
const ITEM_ID: Record<(typeof SPEC_ITEM_TYPES)[number], z.ZodType<string>> = {
  feature: featureIdSchema,
  rule: ruleIdSchema,
  role: roleIdSchema,
  flow: flowIdSchema,
};
export const specItemGetInputSchema = z
  .object({ projectId: z.uuid(), type: z.enum(SPEC_ITEM_TYPES), id: z.string().min(1).max(100) })
  .refine((input) => ITEM_ID[input.type].safeParse(input.id).success, {
    message: "id ne correspond pas au type",
    path: ["id"],
  });

const itemShared = {
  /** Le livrable Fonctionnel est validé : modifier l'élément l'invalidera (avertissement du panneau). */
  validated: z.boolean(),
  /** Éléments de la tête qui citent celui-ci (jeton exact), 20 au plus ; `total` les compte tous. */
  referencedBy: z.object({
    items: z.array(z.object({ kind: specEntityKindSchema, ...refShape })).max(SPEC_REFS_MAX),
    total: z.number().int().min(0),
  }),
};
const itemOf = <T extends (typeof SPEC_ITEM_TYPES)[number], V extends z.ZodType>(
  type: T,
  id: z.ZodType<string>,
  values: V,
) => z.object({ type: z.literal(type), id, values, ...itemShared });
export const specItemSchema = z.discriminatedUnion("type", [
  itemOf("feature", featureIdSchema, featureDetailSchema),
  itemOf("rule", ruleIdSchema, ruleDetailSchema),
  itemOf("role", roleIdSchema, roleDetailSchema),
  itemOf("flow", flowIdSchema, flowDetailSchema),
]);

export const specRefsSearchInputSchema = z.object({
  projectId: z.uuid(),
  kinds: z.array(specRefKindSchema).min(1).max(6),
  q: z.string().max(100),
});
export const specRefsSearchOutputSchema = z.object({
  items: z.array(specRefSchema).max(SPEC_REFS_MAX),
});
