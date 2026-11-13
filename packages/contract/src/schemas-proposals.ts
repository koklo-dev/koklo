import { z } from "zod";
import { listInputShape, listOf } from "./schemas-lists.ts";
import { deliverableKeySchema } from "./schemas-shell.ts";
import { instantSchema } from "./schemas-tickets.ts";

/**
 * Propositions de l'agent (TK-99a, contrat 2.9.0, additif). Une proposition est une donnée relue puis décidée
 * par un humain : rien n'entre dans la spec sans `proposal.decide` puis `specBatch.submit`. `deliverable`
 * accepte les sept livrables (`DELIVERABLE_KEYS`, constante unique reprise par TK-100) ; seul le Fonctionnel est
 * branché côté serveur. Le contenu (`content`, colonne `payload` en base : le contrat n'expose aucun champ nommé `payload`) a la forme de son type, vérifiée par le serveur (schémas de
 * `@koklo/schema`) : le contrat la porte comme un objet.
 */

/** Plafond de la consigne libre d'un lancement ou d'une révision. */
export const PROPOSAL_INSTRUCTION_MAX = 500;

/** Modes de lancement du Fonctionnel. */
export const proposalModeSchema = z.enum(["complete", "criteria", "update", "all"]);
export const proposalKindSchema = z.enum([
  "feature",
  "criteria",
  "rule",
  "role",
  "flow",
  "table",
  "relations",
  "fixtures",
]);
export const proposalStatusSchema = z.enum(["pending", "accepted", "rejected"]);
export const launchStatusSchema = z.enum(["queued", "running", "done", "failed", "canceled"]);
export const proposalDecisionSchema = z.enum(["accept", "reject", "reset"]);

const instructionSchema = z.string().min(1).max(PROPOSAL_INSTRUCTION_MAX);
const contentSchema = z.record(z.string(), z.unknown());

export const aiProposeDeliverableInputSchema = z.object({
  projectId: z.uuid(),
  deliverable: deliverableKeySchema,
  mode: proposalModeSchema,
  instruction: instructionSchema.optional(),
});
export const aiProposeDeliverableOutputSchema = z.object({
  launchId: z.uuid(),
  status: launchStatusSchema,
});

export const aiProposeOptionsInputSchema = z.object({
  projectId: z.uuid(),
  deliverable: deliverableKeySchema,
});
/** Option d'un lancement : `count` calculé en base (absent pour `complete` et `all`) ; une option à 0 est omise. */
export const aiProposeOptionsOutputSchema = z.object({
  options: z.array(
    z.object({
      id: proposalModeSchema,
      count: z.number().int().min(1).optional(),
      recommended: z.boolean(),
    }),
  ),
  /** « L'agent lit » : ce que le modèle reçoit, rien d'autre. */
  reads: z.array(z.object({ id: z.string(), label: z.string() })),
  available: z.boolean(),
  reason: z.enum(["not_wired", "no_frozen_idea"]).optional(),
});

export const proposalSchema = z.object({
  id: z.uuid(),
  launchId: z.uuid(),
  kind: proposalKindSchema,
  zone: z.string(),
  position: z.number().int().min(0),
  title: z.string(),
  rationale: z.string(),
  content: contentSchema,
  status: proposalStatusSchema,
  /** Lot de spec qui a appliqué la proposition ; une proposition appliquée n'est plus modifiable. */
  appliedBatchId: z.uuid().nullable(),
  createdAt: instantSchema,
});

export const aiReviseProposalInputSchema = z.object({
  projectId: z.uuid(),
  proposalId: z.uuid(),
  instruction: instructionSchema,
});

export const PROPOSAL_GROUP_BY = ["type", "type_zone"] as const;
const { cursor, limit } = listInputShape(z.string());
export const proposalListInputSchema = z.object({
  projectId: z.uuid(),
  deliverable: deliverableKeySchema,
  launchId: z.uuid().optional(),
  groupBy: z.enum(PROPOSAL_GROUP_BY),
  status: z.enum(["pending", "all"]).optional(),
  /** Clé d'un groupe (`feature` ou `feature:Réservations`) ; absente : toutes les propositions. */
  group: z.string().min(1).optional(),
  cursor,
  limit,
});

export const proposalGroupSchema = z.object({
  key: z.string(),
  label: z.string(),
  total: z.number().int().min(0),
  accepted: z.number().int().min(0),
  rejected: z.number().int().min(0),
  pending: z.number().int().min(0),
});

export const proposalLaunchSchema = z.object({
  id: z.uuid(),
  status: launchStatusSchema,
  proposedCount: z.number().int().min(0),
  discardedCount: z.number().int().min(0),
  errorCode: z.string().optional(),
  finishedAt: instantSchema.optional(),
});

export const proposalListOutputSchema = listOf(proposalSchema).extend({
  groups: z.array(proposalGroupSchema),
  launch: proposalLaunchSchema.nullable(),
});

export const proposalDecideInputSchema = z.object({
  projectId: z.uuid(),
  proposalId: z.uuid(),
  decision: proposalDecisionSchema,
  /** Contenu corrigé par l'humain, revalidé par le schéma du type avant d'être enregistrée. */
  edited: contentSchema.optional(),
});

export const proposalDecideManyInputSchema = z.object({
  projectId: z.uuid(),
  launchId: z.uuid(),
  group: z.string().min(1),
  decision: z.literal("accept"),
  /** Le N affiché : refusé s'il diffère du nombre réel de propositions en attente du groupe. */
  expectedPending: z.number().int().min(0),
});
export const proposalDecideManyOutputSchema = z.object({ decided: z.number().int().min(0) });
