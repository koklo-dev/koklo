import { z } from "zod";
import { IDEA_MESSAGE_MAX, ideaProposalSchema } from "./schemas-idea.ts";
import { llmProviderSchema } from "./schemas-llm-credential.ts";
import {
  dataCategorySchema,
  dataFieldSchema,
  threatCategorySchema,
  threatSeveritySchema,
  threatVerificationSchema,
} from "./schemas-security.ts";
import { featureIdSchema, featurePrioritySchema, stepTypeSchema } from "./schemas-spec.ts";
import { componentIdSchema } from "./schemas-spec-architecture.ts";
import {
  environmentDataSchema,
  environmentDeploymentSchema,
  nfrCategorySchema,
  nfrIdSchema,
  nfrVerificationSchema,
  operationNameSchema,
  operationTypeSchema,
  stackStatusSchema,
} from "./schemas-spec-technical.ts";
import { instantSchema } from "./schemas-tickets.ts";

/**
 * Propositions de l'IA (0.9.0). Aucune de ces procédures n'écrit : ce sont des propositions que
 * l'humain soumet ensuite à `specBatch.submit`. Aucune entrée ne choisit le modèle, le budget, le
 * fournisseur ni le nonce (le serveur les fixe) ; aucune sortie ne porte de coût monétaire, de
 * prompt ni de clé.
 */
const nonBlank = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value.trim() !== "", "ne peut pas être vide");

export const AI_IDEA_MAX_LENGTH = 8000;
export const AI_FEATURES_MAX = 20;
export const AI_CRITERIA_MAX = 12;

/** Depuis 3.0.0 l'agent lit le dossier figé : un `brief` fourni est refusé (422), les autres champs inconnus sont ignorés. */
export const aiProposeFeaturesInputSchema = z.object({
  projectId: z.uuid(),
  maxFeatures: z.number().int().min(1).max(AI_FEATURES_MAX).optional(),
  brief: z.never({ error: "Le brief est retiré : l'agent lit le dossier figé" }).optional(),
});

export const aiProposeCriteriaInputSchema = z.object({
  projectId: z.uuid(),
  specId: featureIdSchema,
});

const proposedStepSchema = z.object({ type: stepTypeSchema, text: z.string().min(1).max(500) });
export const aiProposedCriterionSchema = z.object({
  title: z.string().min(1).max(200),
  steps: z.array(proposedStepSchema).min(3).max(12),
});
const criteriaSchema = z.array(aiProposedCriterionSchema).min(1).max(AI_CRITERIA_MAX);

/** Sans statut (implicite `brouillon`) ni liens : acceptée telle quelle par `specBatch.submit`. */
export const aiProposedFeatureSchema = z.object({
  kind: z.literal("feature.create"),
  title: z.string().min(1).max(200),
  priority: featurePrioritySchema,
  description: z.string().max(4000),
  criteria: criteriaSchema,
});

/** Modèle servi et consommation ; aucun coût monétaire. */
export const aiMetaSchema = z.object({
  provider: llmProviderSchema,
  model: z.string().min(1),
  usage: z.object({
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
  }),
});

/** `duplicates` : propositions dont le titre égale celui d'une feature de l'index (l'humain tranche). */
export const aiProposeFeaturesOutputSchema = z.object({
  features: z.array(aiProposedFeatureSchema).min(1).max(AI_FEATURES_MAX),
  duplicates: z.array(z.object({ index: z.number().int().min(0), specId: featureIdSchema })),
  meta: aiMetaSchema,
});

export const aiProposeCriteriaOutputSchema = z.object({
  operation: z.object({
    kind: z.literal("feature.update"),
    specId: featureIdSchema,
    criteria: criteriaSchema,
  }),
  meta: aiMetaSchema,
});

export const llmCredentialVerifyOutputSchema = z.object({
  ok: z.literal(true),
  model: z.string().min(1),
  checkedAt: instantSchema,
});

export type AiProposeFeaturesInput = z.input<typeof aiProposeFeaturesInputSchema>;
export type AiProposeCriteriaInput = z.input<typeof aiProposeCriteriaInputSchema>;

/** Actions sur la sélection de l'éditeur (TK-90) : le serveur en tire la consigne, jamais le client. */
export const aiIdeaActionSchema = z.enum([
  "develop",
  "challenge",
  "simplify",
  "find_gaps",
  "make_page",
]);

/** Message à l'agent de l'espace Idée : `pageId` est la page de contexte, `selection` le passage visé. */
export const aiIdeaChatInputSchema = z.object({
  projectId: z.uuid(),
  pageId: z.uuid().optional(),
  mode: z.enum(["interview", "free"]),
  text: nonBlank(IDEA_MESSAGE_MAX),
  action: aiIdeaActionSchema.optional(),
  selection: z.string().max(IDEA_MESSAGE_MAX).optional(),
});

/** Évènements du flux : le texte arrive par morceaux, puis les propositions, puis la fin (`done`). */
export const aiIdeaChatEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("proposals"), proposals: z.array(ideaProposalSchema) }),
  z.object({
    type: z.literal("done"),
    messageId: z.uuid(),
    nextQuestion: z.string().optional(),
  }),
]);

export const AI_IDEA_GAPS_MAX = 4;
export const aiIdeaGapsInputSchema = z.object({ projectId: z.uuid() });
/** Un manque : une page existante (`pageId`) ou une page à créer (`suggestedPageTitle`). */
export const aiIdeaGapSchema = z.object({
  pageId: z.uuid().nullable(),
  suggestedPageTitle: z.string().min(1).max(120).nullable(),
  text: z.string().min(1).max(200),
});
export const aiIdeaGapsOutputSchema = z.object({
  items: z.array(aiIdeaGapSchema).max(AI_IDEA_GAPS_MAX),
  computedAt: instantSchema,
  /** Vrai si le résultat date de moins de 30 s : aucun appel au modèle. */
  cached: z.boolean(),
});

/** Synthèse de l'idée (TK-91) : l'équipe la régénère ; la sortie est celle de `idea.synthesis.get`. */
export const aiIdeaSynthesisInputSchema = z.object({ projectId: z.uuid() });

export type AiIdeaChatInput = z.input<typeof aiIdeaChatInputSchema>;
export type AiIdeaChatEvent = z.output<typeof aiIdeaChatEventSchema>;
export type AiIdeaGapsOutput = z.output<typeof aiIdeaGapsOutputSchema>;

/**
 * Préremplissage du panneau d'édition (TK-101, 2.11.0, B329 d) : une phrase de l'humain (500 caractères), des valeurs en
 * texte brut en retour. Rien n'est écrit : le formulaire n'accepte que les champs vides, l'humain enregistre ensuite par
 * `specBatch.submit`. Le serveur applique la politique de texte brut à l'entrée et à la sortie.
 */
export const AI_PREFILL_DESCRIPTION_MAX = 500;
export const AI_PREFILL_LINKS_MAX = 30;

export const AI_PREFILL_TYPES = [
  "feature",
  "stack",
  "environment",
  "operation",
  "nfr",
  "threat",
  "sensitive",
] as const;

export const aiPrefillItemInputSchema = z.object({
  projectId: z.uuid(),
  type: z.enum(AI_PREFILL_TYPES),
  description: nonBlank(AI_PREFILL_DESCRIPTION_MAX),
});

export const prefilledValuesSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  priority: featurePrioritySchema.optional(),
  description: z.string().max(4000).optional(),
  criteria: z.array(aiProposedCriterionSchema).max(AI_CRITERIA_MAX).optional(),
  links: z.array(z.string().min(1).max(100)).max(AI_PREFILL_LINKS_MAX).optional(),
});

const line = (max: number) => z.string().min(1).max(max);
/** Champs de la feuille « Choix technique » (3.17.0) ; les critères sont des noms, leurs valeurs viennent ensuite. */
export const prefilledStackValuesSchema = z.object({
  role: line(120).optional(),
  components: z.array(componentIdSchema).max(AI_PREFILL_LINKS_MAX).optional(),
  status: stackStatusSchema.optional(),
  choice: line(200).optional(),
  options: z.array(line(120)).max(8).optional(),
  criteria: z.array(line(120)).max(12).optional(),
  why: line(1000).optional(),
  requirements: z.array(nfrIdSchema).max(AI_PREFILL_LINKS_MAX).optional(),
});
/** Champs de la feuille « Environnement » (3.17.0) : ni variable, ni valeur. */
export const prefilledEnvironmentValuesSchema = z.object({
  name: line(120).optional(),
  address: line(200).optional(),
  hosting: line(200).optional(),
  database: line(200).optional(),
  data: environmentDataSchema.optional(),
  deployment: environmentDeploymentSchema.optional(),
  access: line(200).optional(),
});

const operationFieldValue = { field: line(80), type: line(120) };
/** Champs de la feuille « Opération » (3.18.0) : les liens sont des règles et des fonctionnalités. */
export const prefilledOperationValuesSchema = z.object({
  name: operationNameSchema.optional(),
  type: operationTypeSchema.optional(),
  zone: line(80).optional(),
  summary: line(500).optional(),
  permission: line(120).optional(),
  input: z
    .array(z.object({ ...operationFieldValue, constraint: line(300).optional() }))
    .max(40)
    .optional(),
  output: z
    .array(z.object({ ...operationFieldValue, note: line(300).optional() }))
    .max(40)
    .optional(),
  errors: z
    .array(z.object({ code: line(80), when: line(300), rule: line(100).optional() }))
    .max(20)
    .optional(),
  links: z.array(line(100)).max(AI_PREFILL_LINKS_MAX).optional(),
  rateLimit: line(200).optional(),
});
/** Champs de la feuille « Exigence » (3.18.0) : cible mesurable et vérification. */
export const prefilledNfrValuesSchema = z.object({
  category: nfrCategorySchema.optional(),
  title: line(200).optional(),
  target: line(120).optional(),
  statement: line(1000).optional(),
  verification: nfrVerificationSchema.optional(),
  links: z.array(line(100)).max(AI_PREFILL_LINKS_MAX).optional(),
});

/** Champs de la feuille « Menace » (3.19.0). */
export const prefilledThreatValuesSchema = z.object({
  title: line(200).optional(),
  category: threatCategorySchema.optional(),
  severity: threatSeveritySchema.optional(),
  surfaces: z.array(line(100)).max(30).optional(),
  risk: z.string().min(1).max(2000).optional(),
  measures: z.array(line(300)).max(30).optional(),
  verification: threatVerificationSchema.optional(),
});
/** Champs de la feuille « Donnée » (3.19.0) : jamais de conservation (A7), seulement une suggestion. */
export const prefilledSensitiveValuesSchema = z.object({
  field: dataFieldSchema.optional(),
  data: line(200).optional(),
  category: dataCategorySchema.optional(),
  access: z.array(line(120)).max(30).optional(),
  protection: z.string().min(1).max(1000).optional(),
  retentionSuggestion: line(300).optional(),
});

export const aiPrefillItemOutputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("feature"), values: prefilledValuesSchema }),
  z.object({ type: z.literal("stack"), values: prefilledStackValuesSchema }),
  z.object({ type: z.literal("environment"), values: prefilledEnvironmentValuesSchema }),
  z.object({ type: z.literal("operation"), values: prefilledOperationValuesSchema }),
  z.object({ type: z.literal("nfr"), values: prefilledNfrValuesSchema }),
  z.object({ type: z.literal("threat"), values: prefilledThreatValuesSchema }),
  z.object({ type: z.literal("sensitive"), values: prefilledSensitiveValuesSchema }),
]);
