import { z } from "zod";
import { AROUND_WITH_CURSOR_MESSAGE, listInputShape, noAroundWithCursor } from "./schemas-lists.ts";
import {
  isExclusiveRevision,
  nfrCategorySchema,
  nfrIdSchema,
  nfrVerificationSchema,
  operationNameSchema,
  operationTypeSchema,
  TECHNICAL_REVISION_MESSAGE,
  technicalCommitSha,
  technicalFeatureLink,
  technicalRevisionShape,
  technicalRuleLink,
} from "./schemas-spec-technical.ts";

/**
 * Onglets API et Exigences du cahier technique (TK-116, contrat 3.18.0, additif, B768 à B779) : lectures de l'index
 * d'entités. Seuls `ops.source` (YAML) et `contract` (code généré) rendent un texte de fichier, à l'équipe et au designer.
 */
export const OPERATION_PAGE_SIZE = 50;
export const NFR_PAGE_SIZE = 50;
export const OPERATION_CALLERS_MAX = 4;
/** Seul choix qui désigne le générateur de contrat (B770). */
export const CONTRACT_STACK_ID = "ST-api";

const operationShape = {
  specId: operationNameSchema,
  type: operationTypeSchema,
  zone: z.string(),
  component: z.string(),
  summary: z.string(),
  /** `public`, `internal` ou `PM-<ressource>.<action>`. */
  permission: z.string(),
};
export const operationSummarySchema = z.object({ ...operationShape, filePath: z.string() });

/** Entrées, sorties et erreurs dans l'ordre du fichier ; `callers` : rôles qui ont la permission (B778). */
export const operationContentShape = {
  input: z.array(
    z.object({ field: z.string(), type: z.string(), constraint: z.string().optional() }),
  ),
  output: z.array(z.object({ field: z.string(), type: z.string(), note: z.string().optional() })),
  errors: z.array(
    z.object({ code: z.string(), when: z.string(), rule: technicalRuleLink.optional() }),
  ),
  rules: z.array(technicalRuleLink),
  features: z.array(technicalFeatureLink),
  rateLimit: z.string().optional(),
  callers: z
    .array(z.object({ name: z.string(), restriction: z.string().optional() }))
    .max(OPERATION_CALLERS_MAX),
};
export const operationDetailSchema = operationSummarySchema.extend({
  ...operationContentShape,
  commitSha: technicalCommitSha,
});

/** Pages de 50, tri zone puis nom ; `q` sur toute la tête, `zone` filtre sans réduire sa facette. */
export const operationListInputSchema = z
  .object({
    projectId: z.uuid(),
    ...technicalRevisionShape,
    zone: z.string().min(1).max(80).optional(),
    ...listInputShape(operationNameSchema),
  })
  .refine(isExclusiveRevision, TECHNICAL_REVISION_MESSAGE)
  .refine(noAroundWithCursor, AROUND_WITH_CURSOR_MESSAGE);
/** Une opération par son nom : fiche, YAML (`ops.source`) et contrat généré. */
export const operationByIdInputSchema = z
  .object({ projectId: z.uuid(), opId: operationNameSchema, ...technicalRevisionShape })
  .refine(isExclusiveRevision, TECHNICAL_REVISION_MESSAGE);
export const operationOptionsInputSchema = z
  .object({ projectId: z.uuid(), ...technicalRevisionShape })
  .refine(isExclusiveRevision, TECHNICAL_REVISION_MESSAGE);
/** Listes de la feuille « Opération » : zones des composants et des opérations, permissions des rôles (B773). */
export const operationOptionsSchema = z.object({
  zones: z.array(z.string()),
  permissions: z.array(z.string()),
});

/** Contrat généré à la lecture (B770) : rien n'est écrit ; sans générateur, la raison et jamais de code. */
export const technicalContractSchema = z.discriminatedUnion("available", [
  z.object({
    available: z.literal(true),
    generator: z.object({
      stackId: z.literal(CONTRACT_STACK_ID),
      label: z.string(),
      choice: z.string(),
    }),
    path: z.string(),
    code: z.string(),
    commitSha: technicalCommitSha,
  }),
  z.object({
    available: z.literal(false),
    reason: z.enum(["no_choice", "unsupported_stack"]),
    choice: z.string().optional(),
    commitSha: technicalCommitSha,
  }),
]);

const nfrShape = {
  specId: nfrIdSchema,
  category: nfrCategorySchema,
  title: z.string(),
  target: z.string(),
  statement: z.string(),
  verification: nfrVerificationSchema,
  verificationDetail: z.string().optional(),
  /** Composants, choix, décisions et règles cités. */
  links: z.array(z.string()),
};
export const nfrSummarySchema = z.object({ ...nfrShape, filePath: z.string() });
export const nfrDetailSchema = nfrSummarySchema.extend({ commitSha: technicalCommitSha });
/** Pages de 50, tri catégorie puis identifiant ; aucun champ de couverture avant la Qualité (B774). */
export const nfrListInputSchema = z
  .object({
    projectId: z.uuid(),
    ...technicalRevisionShape,
    category: nfrCategorySchema.optional(),
    ...listInputShape(nfrIdSchema),
  })
  .omit({ q: true })
  .refine(isExclusiveRevision, TECHNICAL_REVISION_MESSAGE)
  .refine(noAroundWithCursor, AROUND_WITH_CURSOR_MESSAGE);

export type OperationSummary = z.output<typeof operationSummarySchema>;
export type OperationDetail = z.output<typeof operationDetailSchema>;
export type OperationListInput = z.output<typeof operationListInputSchema>;
export type OperationOptions = z.output<typeof operationOptionsSchema>;
export type TechnicalContract = z.output<typeof technicalContractSchema>;
export type NfrSummary = z.output<typeof nfrSummarySchema>;
export type NfrDetail = z.output<typeof nfrDetailSchema>;
export type NfrListInput = z.output<typeof nfrListInputSchema>;
