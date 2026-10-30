import { z } from "zod";
import { instantSchema, pageInputSchema } from "./schemas-tickets.ts";

/** Valeurs et motifs identiques à ceux de @koklo/schema (parité vérifiée par apps/api/test). */
export const featureStatusSchema = z.enum(["brouillon", "specifiee", "implementee", "adoptee"]);
export const featurePrioritySchema = z.enum(["must", "should", "could", "wont"]);
export const stepTypeSchema = z.enum(["etant_donne", "quand", "alors", "et"]);
export const specIndexStatusSchema = z.enum(["building", "ready", "failed"]);
export const specBatchStatusSchema = z.enum([
  "queued",
  "committing",
  "committed",
  "failed",
  "conflict",
]);
export const specOperationKindSchema = z.enum([
  "feature.create",
  "feature.update",
  "feature.delete",
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

const stepSchema = z.object({ type: stepTypeSchema, text: z.string().min(1) });

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
    }),
  })
  .nullable();

export const featureListInputSchema = z
  .object({
    projectId: z.uuid(),
    status: featureStatusSchema.optional(),
    priority: featurePrioritySchema.optional(),
    ...revisionFields,
    ...pageInputSchema,
  })
  .refine(exclusiveRevision, REVISION_MESSAGE);
export const featureSummarySchema = z.object({
  specId: featureIdSchema,
  title: z.string(),
  status: featureStatusSchema,
  priority: featurePrioritySchema,
  filePath: z.string(),
  criteriaCount: z.number().int().min(0),
});

export const featureGetInputSchema = z.object({ projectId: z.uuid(), specId: featureIdSchema });
export const featureDetailSchema = z.object({
  specId: featureIdSchema,
  title: z.string(),
  status: featureStatusSchema,
  priority: featurePrioritySchema,
  description: z.string(),
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
  criteria: z.array(z.object({ title: z.string().min(1), steps: z.array(stepSchema) })),
  tables: z.array(tableLink),
  endpoints: z.array(endpointLink),
  screens: z.array(screenLink),
  roles: z.array(roleLink),
  rules: z.array(ruleLink),
  nfr: z.array(nfrLink),
};
const optionalFeatureFields = z.object(featureFields).partial();

const featureCreateSchema = optionalFeatureFields
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

/** Tables, endpoints, écrans : hors 0.5.0 ; un nouveau `kind` sera un ajout de version mineure. */
export const specOperationSchema = z.discriminatedUnion("kind", [
  featureCreateSchema,
  featureUpdateSchema,
  featureDeleteSchema,
]);

export const SPEC_BATCH_OPERATIONS_MAX = 50;
/** L'auteur et les trailers du commit viennent de la session : jamais de l'entrée. */
export const specBatchSubmitInputSchema = z.object({
  projectId: z.uuid(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  branch: branchSchema.optional(),
  baseSha: commitShaSchema.optional(),
  message: z.string().max(200).optional(),
  operations: z.array(specOperationSchema).min(1).max(SPEC_BATCH_OPERATIONS_MAX),
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
      specId: featureIdSchema.nullable(),
    }),
  ),
  enqueuedAt: instantSchema,
  committedAt: instantSchema.nullable(),
});
export const specBatchGetInputSchema = z.object({ projectId: z.uuid(), batchId: z.uuid() });
