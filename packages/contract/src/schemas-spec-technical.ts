import { z } from "zod";
import { AROUND_WITH_CURSOR_MESSAGE, listInputShape, noAroundWithCursor } from "./schemas-lists.ts";
import {
  adrIdSchema,
  componentIdSchema,
  DOC_SECTION_DELIVERABLES,
} from "./schemas-spec-architecture.ts";
import { idempotencyKeySchema } from "./schemas-spec-data.ts";
import { permissionIdSchema } from "./schemas-spec-domain.ts";

/**
 * Cahier technique (TK-115, contrat 3.17.0, additif, B718 à B737). Les champs et les vocabulaires sont en anglais, comme
 * les charges des propositions (B738) ; le worker les traduit dans les fichiers `tech/*`, `api/endpoints/*` et `nfr/*`.
 * Identifiants et motifs identiques à ceux de @koklo/schema (parité vérifiée par apps/api/test). Aucun schéma ne porte de
 * valeur de variable : la spec n'en connaît que le nom et l'usage.
 */
const slug = "[a-z0-9][a-z0-9-]*";
const segment = "[a-z0-9][A-Za-z0-9_-]*";
export const stackIdSchema = z.string().regex(new RegExp(`^ST-${slug}$`));
export const environmentIdSchema = z.string().regex(new RegExp(`^ENV-${slug}$`));
/** `NFR-nnn`, et les anciens identifiants `NFR-<texte>` toujours lus (B721). */
export const nfrIdSchema = z.string().regex(new RegExp(`^NFR-${slug}$`));
/** Opération `<zone>.<verbe>` (camelCase et `_` admis, B720). */
export const operationNameSchema = z
  .string()
  .max(120)
  .regex(new RegExp(`^${segment}\\.${segment}$`));

export const STACK_LAYERS = ["applications", "services", "data", "external", "operations"] as const;
export const STACK_ICONS = [
  "web",
  "hub",
  "key",
  "database",
  "queue",
  "sms",
  "mail",
  "cloud",
  "monitoring",
  "rocket_launch",
  "search",
  "payments",
] as const;
export const STACK_STATUSES = ["chosen", "open"] as const;
export const OPERATION_TYPES = ["read", "write", "internal"] as const;
export const NFR_CATEGORIES = [
  "data",
  "performance",
  "security",
  "availability",
  "accessibility",
  "operations",
] as const;
export const NFR_VERIFICATIONS = ["scenario", "ci_measure", "manual", "to_define"] as const;
export const ENVIRONMENT_DATA = ["sample", "anonymized", "real"] as const;
export const ENVIRONMENT_DEPLOYMENTS = ["merge", "version", "manual"] as const;
export const INTEGRATION_STATUSES = [
  "to_choose",
  "account_to_create",
  "configured",
  "connected",
] as const;

export const stackLayerSchema = z.enum(STACK_LAYERS);
export const stackIconSchema = z.enum(STACK_ICONS);
export const stackStatusSchema = z.enum(STACK_STATUSES);
export const operationTypeSchema = z.enum(OPERATION_TYPES);
export const nfrCategorySchema = z.enum(NFR_CATEGORIES);
export const nfrVerificationSchema = z.enum(NFR_VERIFICATIONS);
export const environmentDataSchema = z.enum(ENVIRONMENT_DATA);
export const environmentDeploymentSchema = z.enum(ENVIRONMENT_DEPLOYMENTS);
export const integrationStatusSchema = z.enum(INTEGRATION_STATUSES);

const text = (max: number) => z.string().min(1).max(max);
const ruleLink = z.string().regex(/^R-\d{3,}$/);
const featureLink = z.string().regex(/^F-\d{3,}$/);

// --- Écriture ---
const atLeastOne =
  (fields: object) =>
  (operation: object): boolean =>
    Object.keys(fields).some((key) => (operation as Record<string, unknown>)[key] !== undefined);
const CHANGED = { message: "au moins un champ modifié" };

/** Sans `values`, les valeurs du critère sont reprises du fichier pour les options qui gardent leur nom (B719). */
const stackCriterionInputSchema = z.object({
  label: text(120),
  estimate: z.boolean().optional(),
  values: z.array(text(200)).max(8).optional(),
});
const stackFields = {
  role: text(120),
  /** Absente à la création : déduite du premier composant. */
  layer: stackLayerSchema,
  icon: stackIconSchema,
  components: z.array(componentIdSchema).max(30),
  status: stackStatusSchema,
  /** Retiré par `status: "open"`. */
  choice: text(200),
  recommended: text(120),
  options: z.array(text(120)).min(2).max(8),
  criteria: z.array(stackCriterionInputSchema).max(12),
  why: text(1000),
  plain: text(500),
  requirements: z.array(nfrIdSchema).max(30),
  decisions: z.array(adrIdSchema).max(30),
};
export const stackCreateSchema = z
  .object(stackFields)
  .partial()
  .required({ role: true, status: true, options: true, why: true })
  .extend({ kind: z.literal("stack.create") });
export const stackUpdateSchema = z
  .object(stackFields)
  .partial()
  .extend({ kind: z.literal("stack.update"), specId: stackIdSchema })
  .refine(atLeastOne(stackFields), CHANGED);
export const stackDeleteSchema = z.object({
  kind: z.literal("stack.delete"),
  specId: stackIdSchema,
});

const operationFieldName = z
  .string()
  .max(80)
  .regex(/^[A-Za-z][A-Za-z0-9_.[\]]*$/);
const operationFields = {
  type: operationTypeSchema,
  zone: text(80),
  component: componentIdSchema,
  summary: text(500),
  permission: z.union([z.enum(["public", "internal"]), permissionIdSchema]),
  input: z
    .array(
      z.object({ field: operationFieldName, type: text(120), constraint: text(300).optional() }),
    )
    .max(40),
  output: z
    .array(z.object({ field: operationFieldName, type: text(120), note: text(300).optional() }))
    .max(40),
  errors: z.array(z.object({ code: text(80), when: text(300), rule: ruleLink.optional() })).max(20),
  rules: z.array(ruleLink).max(30),
  features: z.array(featureLink).max(30),
  rateLimit: text(200),
};
/** Le nom `<zone>.<verbe>` est l'identifiant : il ne se modifie pas. */
export const operationCreateSchema = z
  .object(operationFields)
  .partial()
  .required({ type: true, zone: true, component: true, summary: true, permission: true })
  .extend({ kind: z.literal("op.create"), name: operationNameSchema });
export const operationUpdateSchema = z
  .object(operationFields)
  .partial()
  .extend({ kind: z.literal("op.update"), specId: operationNameSchema })
  .refine(atLeastOne(operationFields), CHANGED);
export const operationDeleteSchema = z.object({
  kind: z.literal("op.delete"),
  specId: operationNameSchema,
});

const nfrLinkSchema = z
  .string()
  .regex(new RegExp(`^(C-${slug}|ST-${slug}|ADR-\\d{3,}|R-\\d{3,})$`));
const nfrFields = {
  category: nfrCategorySchema,
  title: text(200),
  target: text(120),
  statement: text(1000),
  verification: nfrVerificationSchema,
  verificationDetail: text(300),
  links: z.array(nfrLinkSchema).max(30),
};
export const nfrCreateSchema = z
  .object(nfrFields)
  .partial()
  .required({ category: true, title: true, target: true, statement: true, verification: true })
  .extend({ kind: z.literal("nfr.create") });
export const nfrUpdateSchema = z
  .object(nfrFields)
  .partial()
  .extend({ kind: z.literal("nfr.update"), specId: nfrIdSchema })
  .refine(atLeastOne(nfrFields), CHANGED);
export const nfrDeleteSchema = z.object({ kind: z.literal("nfr.delete"), specId: nfrIdSchema });

const extraSchema = z.object({ label: text(80), value: text(200) });
const variableSchema = z.object({
  name: z
    .string()
    .max(80)
    .regex(/^[A-Z][A-Z0-9_]*$/),
  usage: text(200),
});
const integrationSchema = z.object({
  service: text(120),
  usage: text(200),
  status: integrationStatusSchema,
});
const environmentShape = {
  name: text(120),
  address: text(200),
  hosting: text(200),
  database: text(200),
  data: environmentDataSchema,
  deployment: environmentDeploymentSchema,
  access: text(200),
  extras: z.array(extraSchema).max(12),
};
/** `variables` et `integrations` valent pour tout le fichier : elles y sont ajoutées ou mises à jour par leur nom (B722). */
const environmentFields = {
  ...environmentShape,
  variables: z.array(variableSchema).max(40),
  integrations: z.array(integrationSchema).max(20),
};
export const environmentCreateSchema = z
  .object(environmentFields)
  .partial()
  .required({ name: true, address: true, hosting: true, database: true, data: true })
  .extend({ kind: z.literal("env.create") });
export const environmentUpdateSchema = z
  .object(environmentFields)
  .partial()
  .extend({
    kind: z.literal("env.update"),
    specId: environmentIdSchema,
    /** Vide : la rubrique « Accès » est retirée du fichier (B765). */
    access: z.string().max(200).optional(),
  })
  .refine(atLeastOne(environmentFields), CHANGED);
export const environmentDeleteSchema = z.object({
  kind: z.literal("env.delete"),
  specId: environmentIdSchema,
});

export const TECHNICAL_OPERATION_KINDS = [
  "stack.create",
  "stack.update",
  "stack.delete",
  "op.create",
  "op.update",
  "op.delete",
  "nfr.create",
  "nfr.update",
  "nfr.delete",
  "env.create",
  "env.update",
  "env.delete",
] as const;

// --- Lecture : index d'entités ; seul `stack.source` rend le YAML, à l'équipe et au designer ---
const commitShaSchema = z.string().regex(/^[0-9a-f]{40}$/);
const revision = { branch: z.string().min(1).optional(), commitSha: commitShaSchema.optional() };
const exclusiveRevision = (value: { branch?: string; commitSha?: string }) =>
  value.branch === undefined || value.commitSha === undefined;
const REVISION_MESSAGE = "branch et commitSha sont exclusifs";

const stackShape = {
  specId: stackIdSchema,
  role: z.string(),
  layer: stackLayerSchema,
  icon: stackIconSchema.optional(),
  status: stackStatusSchema,
  choice: z.string().optional(),
  recommended: z.string().optional(),
  components: z.array(componentIdSchema),
  options: z.array(z.string()),
  /** Une valeur par option, dans le même ordre ; « — » si inconnue. */
  criteria: z.array(
    z.object({ label: z.string(), estimate: z.boolean().optional(), values: z.array(z.string()) }),
  ),
  why: z.string(),
  plain: z.string().optional(),
  requirements: z.array(nfrIdSchema),
  decisions: z.array(adrIdSchema),
};
export const stackSummarySchema = z.object({ ...stackShape, filePath: z.string() });
export const stackDetailSchema = stackSummarySchema.extend({ commitSha: commitShaSchema });

/** Pages de 24 (la grille), tri couche puis identifiant ; `q` sur toute la tête, `around` amène un choix (`?sel=ST-…`). */
export const STACK_PAGE_SIZE = 24;
export const stackListInputSchema = z
  .object({ projectId: z.uuid(), ...revision, ...listInputShape(stackIdSchema) })
  .refine(exclusiveRevision, REVISION_MESSAGE)
  .refine(noAroundWithCursor, AROUND_WITH_CURSOR_MESSAGE);
/** « Choisir » : un lot d'une seule `stack.update`. `option` hors des options du choix : 422. */
export const stackChooseInputSchema = z.object({
  projectId: z.uuid(),
  id: stackIdSchema,
  option: text(120),
  idempotencyKey: idempotencyKeySchema,
  branch: z.string().min(1).optional(),
  baseSha: commitShaSchema.optional(),
});
export const stackSourceInputSchema = z
  .object({ projectId: z.uuid(), id: stackIdSchema, ...revision })
  .refine(exclusiveRevision, REVISION_MESSAGE);

const environmentReadShape = {
  specId: environmentIdSchema,
  name: z.string(),
  address: z.string(),
  hosting: z.string(),
  database: z.string(),
  data: environmentDataSchema,
  deployment: environmentDeploymentSchema.optional(),
  access: z.string().optional(),
  extras: z.array(z.object({ label: z.string(), value: z.string() })),
};
export const environmentSchema = z.object(environmentReadShape);
export const environmentDetailSchema = environmentSchema.extend({
  filePath: z.string(),
  commitSha: commitShaSchema,
});
/** Contenu de `tech/environments.yaml` : jamais de valeur de variable. */
export const environmentsContentShape = {
  environments: z.array(environmentSchema),
  variables: z.array(z.object({ name: z.string(), usage: z.string() })),
  integrations: z.array(
    z.object({ service: z.string(), usage: z.string(), status: integrationStatusSchema }),
  ),
};
export const technicalEnvironmentsInputSchema = z
  .object({ projectId: z.uuid(), ...revision })
  .refine(exclusiveRevision, REVISION_MESSAGE);
/** Rien d'indexé : listes vides et `commitSha` nul. */
export const technicalEnvironmentsSchema = z.object({
  ...environmentsContentShape,
  commitSha: commitShaSchema.nullable(),
});

/** Sections d'un document lues en Git (`architecture/overview/`, `tech/cahier-technique/`) : forme de l'Architecture. */
export const documentSectionsInputSchema = z
  .object({ projectId: z.uuid(), deliverable: z.enum(DOC_SECTION_DELIVERABLES), ...revision })
  .refine(exclusiveRevision, REVISION_MESSAGE);

export type StackSummary = z.output<typeof stackSummarySchema>;
export type StackDetail = z.output<typeof stackDetailSchema>;
export type StackListInput = z.output<typeof stackListInputSchema>;
export type StackChooseInput = z.output<typeof stackChooseInputSchema>;
export type TechnicalEnvironment = z.output<typeof environmentSchema>;
export type TechnicalEnvironmentDetail = z.output<typeof environmentDetailSchema>;
export type TechnicalEnvironments = z.output<typeof technicalEnvironmentsSchema>;
export type DocumentSectionsInput = z.output<typeof documentSectionsInputSchema>;
