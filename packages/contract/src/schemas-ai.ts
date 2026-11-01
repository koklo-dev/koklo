import { z } from "zod";
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
