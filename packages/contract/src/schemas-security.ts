import { z } from "zod";
import { AROUND_WITH_CURSOR_MESSAGE, listInputShape, noAroundWithCursor } from "./schemas-lists.ts";
import { idempotencyKeySchema } from "./schemas-spec-data.ts";
import { permissionIdSchema, roleIdSchema } from "./schemas-spec-domain.ts";

/**
 * Livrable Sécurité (TK-117, contrat 3.19.0, additif, B790 à B818). Champs et vocabulaires en anglais, comme les charges
 * des propositions (B738) ; le worker les traduit dans les fichiers `security/`. Identifiants et motifs identiques à ceux
 * de @koklo/schema (parité vérifiée par apps/api/test). Les textes tiennent sur une ligne, sauf le risque d'une menace et
 * la protection d'une donnée.
 */
const slug = "[a-z0-9][a-z0-9-]*";
const segment = "[a-z0-9][A-Za-z0-9_-]*";
const bounded = "[a-z0-9][a-z0-9-]{0,62}";
export const threatIdSchema = z
  .string()
  .max(16)
  .regex(/^SEC-T\d{2,}$/);
/** Champ du modèle `<slug de table>.<champ>`. */
export const dataFieldSchema = z.string().regex(new RegExp(`^${bounded}\\.[a-z_][a-z0-9_]{0,62}$`));
/** À l'écriture, un champ ou une table seule (développée en ses champs du moment, B795). */
const fieldOrTableSchema = z.union([
  dataFieldSchema,
  z.string().regex(new RegExp(`^(T-)?${bounded}$`)),
]);
/** Identifiant d'une exigence ASVS : jamais un chemin. */
export const asvsRequirementIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/);

export const THREAT_CATEGORIES = [
  "spoofing",
  "unauthorized_access",
  "data_leak",
  "tampering",
  "abuse",
  "compliance",
] as const;
export const THREAT_SEVERITIES = ["high", "medium", "low"] as const;
export const THREAT_VERIFICATIONS = ["scenario", "ci_check", "human_review"] as const;
export const THREAT_FILTERS = ["high", "todo", "ci"] as const;
export const DATA_CATEGORIES = ["personal", "contact", "sensitive", "secret", "technical"] as const;
export const ASVS_CHAPTERS = [
  "authentication",
  "sessions",
  "access_control",
  "validation",
  "cryptography",
  "logging",
  "data_protection",
  "configuration",
  "api",
] as const;
export const SECURITY_ACCESS = ["yes", "no", "restricted"] as const;
export const SUMMARY_CARD_KEYS = [
  "location",
  "protection",
  "access",
  "signIn",
  "retention",
  "checks",
  "incident",
] as const;

export const threatCategorySchema = z.enum(THREAT_CATEGORIES);
export const threatSeveritySchema = z.enum(THREAT_SEVERITIES);
export const threatVerificationSchema = z.enum(THREAT_VERIFICATIONS);
export const dataCategorySchema = z.enum(DATA_CATEGORIES);
export const asvsChapterSchema = z.enum(ASVS_CHAPTERS);
export const asvsLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const surfaceSchema = z.union([z.string().regex(/^F-\d{3,}$/), z.literal("api")]);
const linkPatterns = [
  `${segment}\\.${segment}`,
  `T-${slug}`,
  `${bounded}\\.[a-z_][a-z0-9_]{0,62}`,
  `RL-${slug}`,
  `NFR-${slug}`,
  `ST-${slug}`,
  `ENV-${slug}`,
  `S-${slug}`,
  "R-\\d{3,}",
];
const linkOf = (patterns: readonly string[]) =>
  z
    .string()
    .max(130)
    .regex(new RegExp(`^(${patterns.join("|")})$`));
/** Liens d'une menace : opération, table, champ, rôle, exigence, choix, environnement, écran ou règle. */
export const threatLinkSchema = linkOf(linkPatterns);
const asvsLinkSchema = linkOf([
  ...linkPatterns,
  "F-\\d{3,}",
  "SEC-T\\d{2,}",
  "ADR-\\d{3,}",
  `C-${slug}`,
  `PM-${slug}(\\.${slug})*`,
]);

const LINE_BREAKS = "\r\n\0\u2028\u2029";
/** Une seule ligne : ni saut de ligne, ni NUL, ni séparateur Unicode. */
const isOneLine = (value: string): boolean =>
  [...value].every((char) => !LINE_BREAKS.includes(char));
const ONE_LINE = "une seule ligne";
const line = (max: number) => z.string().min(1).max(max).refine(isOneLine, ONE_LINE);
/** Comme `line`, ou vide : la valeur est retirée du fichier. */
const removable = (max: number) => z.string().max(max).refine(isOneLine, ONE_LINE);
const text = (max: number) => z.string().min(1).max(max);

// --- Écriture : opérations de lot ---
const changed =
  (fields: object, message = "au moins un champ modifié") =>
  <T extends z.ZodType>(schema: T) =>
    schema.refine(
      (operation) =>
        Object.keys(fields).some(
          (key) => (operation as Record<string, unknown>)[key] !== undefined,
        ),
      { message },
    );

const scenarioSchema = z.object({ when: line(300), expected: line(300) });
const threatFields = {
  title: line(200),
  surfaces: z.array(surfaceSchema).min(1).max(30),
  category: threatCategorySchema,
  severity: threatSeveritySchema,
  risk: text(2000),
  measures: z.array(line(300)).max(30),
  verification: threatVerificationSchema,
  /** Vide : retiré. */
  verificationDetail: removable(300),
  scenario: scenarioSchema,
  links: z.array(threatLinkSchema).max(50),
};
const requiredThreat = {
  title: true,
  surfaces: true,
  category: true,
  severity: true,
  risk: true,
  verification: true,
} as const;
const newThreat = z.object(threatFields).partial().required(requiredThreat);
export const threatCreateSchema = newThreat.extend({ kind: z.literal("threat.create") });
export const threatUpdateSchema = changed(threatFields)(
  z
    .object(threatFields)
    .partial()
    .extend({ kind: z.literal("threat.update"), specId: threatIdSchema }),
);
export const threatDeleteSchema = z.object({
  kind: z.literal("threat.delete"),
  specId: threatIdSchema,
});

const sensitiveFields = {
  data: line(200),
  fields: z.array(fieldOrTableSchema).min(1).max(200),
  category: dataCategorySchema,
  /** Saisie humaine seule (A7) ; vide : retirée. Refusée dans un lot qui porte des propositions. */
  retention: removable(300),
  retentionSuggestion: removable(300),
  access: z.array(line(120)).max(30),
  /** Vide : retirée. */
  protection: z.string().max(1000),
};
const newSensitive = z
  .object(sensitiveFields)
  .partial()
  .required({ data: true, fields: true, category: true });
export const sensitiveCreateSchema = newSensitive.extend({ kind: z.literal("sensitive.create") });
export const sensitiveUpdateSchema = changed(sensitiveFields)(
  z
    .object(sensitiveFields)
    .partial()
    .extend({ kind: z.literal("sensitive.update"), specId: dataFieldSchema }),
);
export const sensitiveDeleteSchema = z.object({
  kind: z.literal("sensitive.delete"),
  specId: dataFieldSchema,
});

const rightShape = {
  role: roleIdSchema.optional(),
  permission: permissionIdSchema.optional(),
  restriction: line(300).optional(),
  ownershipRule: line(300).optional(),
};
const RIGHT_KEYS = Object.keys(rightShape);
const RIGHT_FORMS: readonly (readonly string[])[] = [
  ["role", "permission", "restriction"],
  ["ownershipRule"],
];
/** Une restriction d'un rôle sur une permission, ou une règle de propriété : jamais un octroi (B794). */
const isOneRight = (value: object): boolean => {
  const present = RIGHT_KEYS.filter((key) => (value as Record<string, unknown>)[key] !== undefined);
  return RIGHT_FORMS.some(
    (form) => form.length === present.length && form.every((key) => present.includes(key)),
  );
};
const RIGHT_MESSAGE = "une restriction ou une règle de propriété";
export const rightCreateSchema = z
  .object({ kind: z.literal("right.create"), ...rightShape })
  .refine(isOneRight, RIGHT_MESSAGE);
export const rightDeleteSchema = z
  .object({ kind: z.literal("right.delete"), ...rightShape })
  .refine(isOneRight, RIGHT_MESSAGE);

export const asvsSetLevelSchema = z.object({
  kind: z.literal("asvs.set_level"),
  level: asvsLevelSchema,
});
const requirementFields = {
  chapter: asvsChapterSchema,
  title: line(300),
  level: asvsLevelSchema,
  answer: line(500),
  links: z.array(asvsLinkSchema).max(30),
};
export const asvsCreateSchema = z
  .object(requirementFields)
  .partial()
  .required({ chapter: true, title: true, level: true })
  .extend({
    kind: z.literal("asvs.create"),
    /** Absent : attribué par le worker. */
    requirementId: asvsRequirementIdSchema.optional(),
  });
const factsSchema = z
  .array(z.object({ label: line(120), value: line(500) }))
  .min(1)
  .max(20);
/** Une exigence (par `requirementId`), ou les faits « Secrets et dépendances » : jamais les deux. */
const isOneAsvsUpdate = (operation: object): boolean => {
  const values = operation as Record<string, unknown>;
  const touched = Object.keys(requirementFields).some((key) => values[key] !== undefined);
  if (values.facts !== undefined) return values.requirementId === undefined && !touched;
  return values.requirementId !== undefined && touched;
};
export const asvsUpdateSchema = z
  .object(requirementFields)
  .partial()
  .extend({
    kind: z.literal("asvs.update"),
    requirementId: asvsRequirementIdSchema.optional(),
    facts: factsSchema.optional(),
  })
  .refine(isOneAsvsUpdate, "une exigence modifiée ou des faits");

/** Carte du résumé client : bornée, sans titre (l'API et le worker refusent en plus tout identifiant technique). */
const card = text(2000).refine((value) => !/^\s*#/m.test(value), "titre refusé");
const summaryFields = {
  location: card,
  protection: card,
  access: card,
  signIn: card,
  checks: card,
  incident: card,
};
/** La carte « Combien de temps on garde » est composée par le code depuis les durées saisies (B796). */
export const summaryUpdateSchema = changed(
  summaryFields,
  "au moins une carte",
)(
  z
    .object(summaryFields)
    .partial()
    .extend({ kind: z.literal("summary.update") }),
);

export const SECURITY_OPERATION_KINDS = [
  "threat.create",
  "threat.update",
  "threat.delete",
  "sensitive.create",
  "sensitive.update",
  "sensitive.delete",
  "right.create",
  "right.delete",
  "asvs.set_level",
  "asvs.create",
  "asvs.update",
  "summary.update",
] as const;

// --- Lecture (équipe et designer) ---
const sha = z.string().regex(/^[0-9a-f]{40}$/);
const revisionShape = { branch: z.string().min(1).optional(), commitSha: sha.optional() };
const exclusive = (value: { branch?: string; commitSha?: string }) =>
  value.branch === undefined || value.commitSha === undefined;
const REVISION_MESSAGE = "branch et commitSha sont exclusifs";
export const securityRevisionInputSchema = z
  .object({ projectId: z.uuid(), ...revisionShape })
  .refine(exclusive, REVISION_MESSAGE);
/** Écritures de la page : un lot d'une opération, comme « Choisir » (B807). */
export const securityWriteShape = {
  projectId: z.uuid(),
  idempotencyKey: idempotencyKeySchema,
  branch: z.string().min(1).optional(),
  baseSha: sha.optional(),
};

const count = z.number().int().min(0);
const surfaceTitleSchema = z.object({ id: z.string(), title: z.string() });

export const THREAT_PAGE_SIZE = 50;
export const threatListInputSchema = z
  .object({
    projectId: z.uuid(),
    filter: z.enum(THREAT_FILTERS).optional(),
    ...revisionShape,
    ...listInputShape(threatIdSchema),
  })
  .refine(exclusive, REVISION_MESSAGE)
  .refine(noAroundWithCursor, AROUND_WITH_CURSOR_MESSAGE);
export const threatSummarySchema = z.object({
  id: threatIdSchema,
  title: z.string(),
  /** Première surface : la menace est rangée sous elle (B792). */
  surface: surfaceSchema,
  surfaces: z.array(surfaceSchema),
  category: threatCategorySchema,
  severity: threatSeveritySchema,
  /** Sans parade : à traiter. */
  status: z.enum(["todo", "ok"]),
  verification: threatVerificationSchema,
});
export const threatByIdInputSchema = z
  .object({ projectId: z.uuid(), threatId: threatIdSchema, ...revisionShape })
  .refine(exclusive, REVISION_MESSAGE);
export const threatDetailSchema = threatSummarySchema.extend({
  surfaceTitles: z.array(surfaceTitleSchema),
  risk: z.string(),
  measures: z.array(z.string()),
  verificationDetail: z.string().optional(),
  scenario: z.object({ when: z.string(), expected: z.string() }).optional(),
  links: z.array(z.string()),
  /** Scénario d'abus tel que le worker l'écrit ; vide hors vérification par scénario. */
  gherkin: z.string(),
  scenarioPath: z.string().nullable(),
  filePath: z.string(),
  commitSha: sha,
});
export const threatCreateInputSchema = newThreat.extend(securityWriteShape);
export const threatUpdateInputSchema = changed(threatFields)(
  z
    .object(threatFields)
    .partial()
    .extend({ ...securityWriteShape, threatId: threatIdSchema }),
);

export const DATA_PAGE_SIZE = 50;
export const dataListInputSchema = z
  .object({
    projectId: z.uuid(),
    category: dataCategorySchema.optional(),
    /** « À décider » : champs non classés et entrées sans durée. */
    undecided: z
      .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
      .optional(),
    ...revisionShape,
    ...listInputShape(dataFieldSchema),
  })
  .refine(exclusive, REVISION_MESSAGE)
  .refine(noAroundWithCursor, AROUND_WITH_CURSOR_MESSAGE);
/** Une entrée classée (identité : premier champ), ou un champ du modèle sans entrée. */
export const dataRowSchema = z.object({
  field: z.string(),
  data: z.string().optional(),
  fields: z.array(z.string()),
  category: dataCategorySchema.optional(),
  retention: z.string().optional(),
  retentionSuggestion: z.string().optional(),
  access: z.array(z.string()),
  protection: z.string().optional(),
  status: z.enum(["classified", "undecided", "unclassified"]),
});
export const dataEntryDetailSchema = dataRowSchema.extend({ filePath: z.string(), commitSha: sha });
/** Contexte tiré du cahier technique et de `data.yaml` ; vide ou `null` : « à préciser ». */
export const securityContextSchema = z.object({
  hosting: z.array(z.string()),
  subprocessors: z.array(z.string()),
  transfers: z.string().nullable(),
});
const classifyBase = z
  .object(sensitiveFields)
  .partial()
  .extend({
    ...securityWriteShape,
    /** Entrée existante à modifier ; absent : une entrée est créée (`data`, `fields`, `category`). */
    id: dataFieldSchema.optional(),
  });
export const dataClassifyInputSchema = classifyBase.refine(
  (input) =>
    input.id === undefined
      ? input.data !== undefined && input.fields !== undefined && input.category !== undefined
      : Object.keys(sensitiveFields).some(
          (key) => (input as Record<string, unknown>)[key] !== undefined,
        ),
  "une nouvelle entrée exige donnée, champs et catégorie ; une entrée existante, un changement",
);
export const registryExportSchema = z.object({ filename: z.string(), markdown: z.string() });

export const rightsMatrixSchema = z.object({
  roles: z.array(z.object({ id: z.string(), name: z.string() })),
  actions: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      cells: z.array(
        z.object({
          role: z.string(),
          access: z.enum(SECURITY_ACCESS),
          restriction: z.string().optional(),
        }),
      ),
    }),
  ),
  restrictions: z.array(
    z.object({ role: z.string(), permission: z.string(), restriction: z.string() }),
  ),
  ownershipRules: z.array(z.string()),
  /** Cases « non » ou restreintes (B813). */
  abuseScenarios: count,
  commitSha: sha.nullable(),
});

export const asvsReportSchema = z.object({
  level: asvsLevelSchema,
  recommendedLevel: asvsLevelSchema,
  /** Vrai : le niveau vient d'un choix humain. */
  chosen: z.boolean(),
  chapters: z.array(
    z.object({
      chapter: asvsChapterSchema,
      answered: count,
      total: count,
      where: z.array(z.string()),
      status: z.enum(["covered", "missing", "to_check"]),
    }),
  ),
  answered: count,
  total: count,
  facts: z.array(z.object({ label: z.string(), value: z.string() })),
  commitSha: sha.nullable(),
});
export const asvsSetLevelInputSchema = z.object({ ...securityWriteShape, level: asvsLevelSchema });

export const summaryCardSchema = z.object({
  key: z.enum(SUMMARY_CARD_KEYS),
  title: z.string(),
  text: z.string(),
});
/** Contact en cas d'incident (B801) : en base seulement. */
export const incidentContactSchema = z.object({
  name: line(120).refine((value) => value.trim() !== "", "ne peut pas être vide"),
  phone: z
    .string()
    .min(1)
    .max(40)
    .regex(/^\+?[0-9][0-9 .()-]*$/, "numéro de téléphone attendu"),
});
export const summaryReadSchema = z.object({
  /** Un résumé est indexé. */
  available: z.boolean(),
  cards: z.array(summaryCardSchema),
  commitSha: sha.nullable(),
  contact: incidentContactSchema.optional(),
});
export const summaryAcceptInputSchema = z.object({ ...securityWriteShape, proposalId: z.uuid() });

export type ThreatSummary = z.output<typeof threatSummarySchema>;
export type ThreatDetail = z.output<typeof threatDetailSchema>;
export type ThreatListInput = z.output<typeof threatListInputSchema>;
export type ThreatCreateInput = z.output<typeof threatCreateInputSchema>;
export type ThreatUpdateInput = z.output<typeof threatUpdateInputSchema>;
export type SecurityDataRow = z.output<typeof dataRowSchema>;
export type SecurityDataEntryDetail = z.output<typeof dataEntryDetailSchema>;
export type SecurityDataListInput = z.output<typeof dataListInputSchema>;
export type SecurityDataClassifyInput = z.output<typeof dataClassifyInputSchema>;
export type SecurityContextOutput = z.output<typeof securityContextSchema>;
export type SecurityRightsMatrix = z.output<typeof rightsMatrixSchema>;
export type SecurityAsvsReport = z.output<typeof asvsReportSchema>;
export type SecuritySummaryRead = z.output<typeof summaryReadSchema>;
export type SecuritySummaryCard = z.output<typeof summaryCardSchema>;
export type IncidentContact = z.output<typeof incidentContactSchema>;
