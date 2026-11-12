import { z } from "zod";
import { overviewDeliverableStatusSchema } from "./schemas-overview.ts";
import { deliverableKeySchema } from "./schemas-shell.ts";

/**
 * Livrables de la spec (TK-100, contrat 2.10.0, additif). `status` reprend les quatre statuts de la vue d'ensemble ;
 * `available` suit B1 (un livrable s'ouvre quand son amont est prêt) ou un forçage (`forced`) qui ne vaut jamais
 * validation. `condition` dit ce qui l'ouvre tant qu'il est verrouillé. `pendingProposals` : propositions de l'agent en
 * attente de relecture (toujours 0 pour le client, qui n'en voit jamais). `staleBecause` : version d'idée qui a changé
 * depuis la dernière validation et nombre de pages touchées.
 */
export const specDeliverableSchema = z.object({
  key: deliverableKeySchema,
  status: overviewDeliverableStatusSchema,
  available: z.boolean(),
  forced: z.boolean(),
  condition: z.string().nullable(),
  pendingProposals: z.number().int().min(0),
  staleBecause: z.object({ idea: z.string(), changedPages: z.number().int().min(0) }).optional(),
});

export const specDeliverablesInputSchema = z.object({ projectId: z.uuid() });

export const specDeliverablesSchema = z.object({
  /** Les sept livrables, dans l'ordre de `DELIVERABLE_KEYS`. */
  deliverables: z.array(specDeliverableSchema),
  validatedCount: z.number().int().min(0),
});

/** Forcer l'ouverture d'un livrable : `confirm: true` explicite, owner et admin seulement. */
export const specForceDeliverableInputSchema = z.object({
  projectId: z.uuid(),
  key: deliverableKeySchema,
  confirm: z.literal(true),
});

export type SpecDeliverable = z.infer<typeof specDeliverableSchema>;
export type SpecDeliverablesOutput = z.infer<typeof specDeliverablesSchema>;
