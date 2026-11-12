import { z } from "zod";
import { IDEA_MESSAGE_MAX, ideaProposalSchema } from "./schemas-idea.ts";
import { llmProviderSchema } from "./schemas-llm-credential.ts";
import { featureIdSchema, featurePrioritySchema, stepTypeSchema } from "./schemas-spec.ts";
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
export const AI_ANSWERS_MAX = 10;
export const AI_ANSWER_MAX_LENGTH = 1000;
export const AI_BRIEF_INPUT_MAX_LENGTH = 20_000;
export const AI_FEATURES_MAX = 20;
export const AI_CRITERIA_MAX = 12;

export const aiDraftBriefInputSchema = z.object({
  projectId: z.uuid(),
  idea: nonBlank(AI_IDEA_MAX_LENGTH),
  answers: z.array(z.string().min(1).max(AI_ANSWER_MAX_LENGTH)).max(AI_ANSWERS_MAX).optional(),
});

export const aiProposeFeaturesInputSchema = z.object({
  projectId: z.uuid(),
  brief: nonBlank(AI_BRIEF_INPUT_MAX_LENGTH),
  maxFeatures: z.number().int().min(1).max(AI_FEATURES_MAX).optional(),
});

export const aiProposeCriteriaInputSchema = z.object({
  projectId: z.uuid(),
  specId: featureIdSchema,
});

/** Brief structuré : texte libre borné, jamais persisté par le serveur. */
export const aiBriefSchema = z.object({
  title: z.string().min(1).max(200),
  problem: z.string().min(1).max(2000),
  users: z.string().min(1).max(2000),
  expectedOutcome: z.string().min(1).max(2000),
  constraints: z.string().max(2000),
  openQuestions: z.array(z.string().min(1).max(500)).max(10),
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

export const aiDraftBriefOutputSchema = z.object({ brief: aiBriefSchema, meta: aiMetaSchema });

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

export type AiDraftBriefInput = z.input<typeof aiDraftBriefInputSchema>;
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

export const aiPrefillItemInputSchema = z.object({
  projectId: z.uuid(),
  type: z.literal("feature"),
  description: nonBlank(AI_PREFILL_DESCRIPTION_MAX),
});

export const prefilledValuesSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  priority: featurePrioritySchema.optional(),
  description: z.string().max(4000).optional(),
  criteria: z.array(aiProposedCriterionSchema).max(AI_CRITERIA_MAX).optional(),
  links: z.array(z.string().min(1).max(100)).max(AI_PREFILL_LINKS_MAX).optional(),
});

export const aiPrefillItemOutputSchema = z.object({
  type: z.literal("feature"),
  values: prefilledValuesSchema,
});
