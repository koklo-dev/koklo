import { z } from "zod";
import {
  AROUND_WITH_CURSOR_MESSAGE,
  LIST_QUERY_MAX_LENGTH,
  listInputShape,
  noAroundWithCursor,
} from "./schemas-lists.ts";

/**
 * Règles métier, rôles et parcours (TK-103, contrat 3.1.0, B338 à B341). Valeurs et motifs identiques à ceux de
 * @koklo/schema (parité vérifiée par apps/api/test). Les identifiants `R-nnn`, `RL-<slug>` et `P-<slug>` sont attribués
 * par le serveur à la création.
 */
const slug = "[a-z0-9][a-z0-9-]*";
export const ruleTypeSchema = z.enum(["contrainte", "calcul", "workflow"]);
export const ruleIdSchema = z.string().regex(/^R-\d{3,}$/);
export const roleIdSchema = z.string().regex(new RegExp(`^RL-${slug}$`));
export const flowIdSchema = z.string().regex(new RegExp(`^P-${slug}$`));
export const permissionIdSchema = z.string().regex(new RegExp(`^PM-${slug}(\\.${slug})*$`));
/** Un identifiant d'élément écrit par un lot : fonctionnalité, règle, rôle, parcours, table ou jeu d'exemple (3.5.0). */
export const specIdSchema = z
  .string()
  .regex(new RegExp(`^(F-\\d{3,}|R-\\d{3,}|RL-${slug}|P-${slug}|T-${slug}|FX-${slug})$`));

const featureLink = z.string().regex(/^F-\d{3,}$/);
const tableLink = z.string().regex(new RegExp(`^T-${slug}$`));
/** Endpoint : `E-<slug>` (format v1) ou `<zone>.<verbe>` (format v2, 3.4.0). */
export const endpointLink = z.string().regex(new RegExp(`^(E-${slug}|${slug}\\.${slug})$`));
const screenLink = z.string().regex(new RegExp(`^S-${slug}$`));
const text = (max: number) => z.string().min(1).max(max);

export const flowStepSchema = z.object({ label: text(500), screen: screenLink.optional() });
export const flowErrorSchema = z.object({ step: z.number().int().min(1).max(30), text: text(300) });
export const rolePermissionSchema = z.object({
  id: permissionIdSchema,
  restriction: text(200).optional(),
});

// --- Écriture ---
const ruleFields = {
  title: text(200),
  type: ruleTypeSchema,
  statement: text(2000),
  examples: z.array(text(1000)).max(20),
  /** Noms des états d'un workflow ; le premier est l'état initial. */
  states: z.array(text(120)).max(20),
  features: z.array(featureLink).max(50),
  tables: z.array(tableLink),
  endpoints: z.array(endpointLink),
};
const roleFields = {
  name: text(120),
  description: text(2000),
  permissions: z.array(rolePermissionSchema).min(1).max(100),
};
const flowFields = {
  title: text(200),
  actor: text(120),
  start: flowStepSchema,
  steps: z.array(flowStepSchema).min(1).max(30),
  errors: z.array(flowErrorSchema).max(20),
  features: z.array(featureLink).max(50),
};

const atLeastOne = (fields: Record<string, unknown>) => (op: Record<string, unknown>) =>
  Object.keys(fields).some((field) => op[field] !== undefined);
const AT_LEAST_ONE = "au moins un champ modifié";

export const ruleCreateSchema = z
  .object(ruleFields)
  .partial()
  .required({ title: true, type: true, statement: true })
  .extend({ kind: z.literal("rule.create") })
  .refine((rule) => rule.type !== "workflow" || (rule.states?.length ?? 0) > 0, {
    message: "un workflow porte au moins un état",
    path: ["states"],
  });
export const ruleUpdateSchema = z
  .object(ruleFields)
  .partial()
  .extend({ kind: z.literal("rule.update"), specId: ruleIdSchema })
  .refine(atLeastOne(ruleFields), AT_LEAST_ONE);
export const ruleDeleteSchema = z.object({ kind: z.literal("rule.delete"), specId: ruleIdSchema });

export const roleCreateSchema = z.object(roleFields).extend({ kind: z.literal("role.create") });
export const roleUpdateSchema = z
  .object(roleFields)
  .partial()
  .extend({ kind: z.literal("role.update"), specId: roleIdSchema })
  .refine(atLeastOne(roleFields), AT_LEAST_ONE);
export const roleDeleteSchema = z.object({ kind: z.literal("role.delete"), specId: roleIdSchema });

export const flowCreateSchema = z
  .object(flowFields)
  .partial()
  .required({ title: true, actor: true, start: true, steps: true })
  .extend({ kind: z.literal("flow.create") });
export const flowUpdateSchema = z
  .object(flowFields)
  .partial()
  .extend({ kind: z.literal("flow.update"), specId: flowIdSchema })
  .refine(atLeastOne(flowFields), AT_LEAST_ONE);
export const flowDeleteSchema = z.object({ kind: z.literal("flow.delete"), specId: flowIdSchema });

export const DOMAIN_OPERATION_KINDS = [
  "rule.create",
  "rule.update",
  "rule.delete",
  "role.create",
  "role.update",
  "role.delete",
  "flow.create",
  "flow.update",
  "flow.delete",
] as const;

// --- Lecture : listes des onglets Règles métier et Parcours ---
/** `around` : une règle `R-nnn` ou un parcours `P-<slug>` à amener dans la page. */
const functionalAroundSchema = z.union([ruleIdSchema, flowIdSchema]);

export const functionalListInputSchema = z
  .object({
    projectId: z.uuid(),
    tab: z.enum(["rules", "flows"]),
    /** Filtre de type des règles (sans effet sur les parcours). */
    type: ruleTypeSchema.optional(),
    branch: z.string().min(1).optional(),
    commitSha: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .optional(),
    ...listInputShape(functionalAroundSchema),
  })
  .refine(
    (value) => value.branch === undefined || value.commitSha === undefined,
    "branch et commitSha sont exclusifs",
  )
  .refine(noAroundWithCursor, AROUND_WITH_CURSOR_MESSAGE);

export const rolesMatrixInputSchema = z
  .object({
    projectId: z.uuid(),
    /** Ressource dont on ouvre le groupe. */
    group: text(100).optional(),
    q: z.string().min(1).max(LIST_QUERY_MAX_LENGTH).optional(),
    branch: z.string().min(1).optional(),
    commitSha: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .optional(),
  })
  .refine(
    (value) => value.branch === undefined || value.commitSha === undefined,
    "branch et commitSha sont exclusifs",
  );

const filePath = z.string();
export const functionalRuleSchema = z.object({
  kind: z.literal("rule"),
  specId: ruleIdSchema,
  title: z.string(),
  type: ruleTypeSchema,
  statement: z.string(),
  example: z.string().optional(),
  states: z.array(z.string()),
  features: z.array(featureLink),
  filePath,
});
export const functionalFlowSchema = z.object({
  kind: z.literal("flow"),
  specId: flowIdSchema,
  title: z.string(),
  actor: z.string(),
  start: flowStepSchema,
  steps: z.array(flowStepSchema),
  errors: z.array(flowErrorSchema),
  features: z.array(featureLink),
  filePath,
});
export const functionalItemSchema = z.discriminatedUnion("kind", [
  functionalRuleSchema,
  functionalFlowSchema,
]);

// --- Lecture : matrice des rôles ---
export const roleSummarySchema = z.object({
  specId: roleIdSchema,
  name: z.string(),
  description: z.string().optional(),
  permissionCount: z.number().int().min(0),
});
export const matrixGroupSchema = z.object({
  resource: z.string(),
  count: z.number().int().min(0),
  /** Les actions du groupe figurent dans `actions` (groupe demandé, de moins de 5 actions, ou matrice de 20 actions au plus). */
  open: z.boolean(),
});
export const matrixActionSchema = z.object({
  specId: permissionIdSchema,
  label: z.string(),
  resource: z.string(),
  /** Un accès par rôle, dans l'ordre de `roles`. */
  access: z.array(
    z.object({
      roleId: roleIdSchema,
      level: z.enum(["allowed", "restricted", "denied"]),
      restriction: z.string().optional(),
    }),
  ),
});
export const rolesMatrixSchema = z.object({
  roles: z.array(roleSummarySchema),
  groups: z.array(matrixGroupSchema),
  actions: z.array(matrixActionSchema),
  /** Nombre d'actions correspondant à la recherche, ouvertes ou non. */
  total: z.number().int().min(0),
});

// --- Lecture : valeurs d'un élément du panneau d'édition ---
const detailBase = { filePath, commitSha: z.string().regex(/^[0-9a-f]{40}$/) };
export const ruleDetailSchema = z.object({
  specId: ruleIdSchema,
  title: z.string(),
  type: ruleTypeSchema,
  statement: z.string(),
  examples: z.array(z.string()),
  states: z.array(z.string()),
  features: z.array(featureLink),
  tables: z.array(tableLink),
  endpoints: z.array(endpointLink),
  ...detailBase,
});
export const roleDetailSchema = z.object({
  specId: roleIdSchema,
  name: z.string(),
  description: z.string(),
  permissions: z.array(
    z.object({ specId: permissionIdSchema, restriction: z.string().optional() }),
  ),
  ...detailBase,
});
export const flowDetailSchema = z.object({
  specId: flowIdSchema,
  title: z.string(),
  actor: z.string(),
  start: flowStepSchema,
  steps: z.array(flowStepSchema),
  errors: z.array(flowErrorSchema),
  features: z.array(featureLink),
  ...detailBase,
});
