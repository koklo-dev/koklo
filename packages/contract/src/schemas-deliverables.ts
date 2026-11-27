import { z } from "zod";
import { overviewDeliverableStatusSchema } from "./schemas-overview.ts";
import { deliverableKeySchema } from "./schemas-shell.ts";
import { adrIdSchema, archFlowIdSchema, componentIdSchema } from "./schemas-spec-architecture.ts";

/** Changements et éléments concernés rendus au plus pour le cahier technique (3.17.0). */
export const STALE_TECHNICAL_MAX = 50;
/**
 * Technique à revoir (3.17.0) : composants et décisions ajoutés, retirés, modifiés ou acceptés depuis la dernière
 * décision, et les choix, opérations et exigences qui les citent.
 */
export const staleTechnicalSchema = z.object({
  changes: z
    .array(
      z.object({
        id: z.union([componentIdSchema, adrIdSchema]),
        change: z.enum(["added", "removed", "changed", "accepted"]),
      }),
    )
    .max(STALE_TECHNICAL_MAX),
  items: z.array(z.string()).max(STALE_TECHNICAL_MAX),
});

/**
 * Sécurité à revoir (3.19.0, B805) : choix de la stack, opérations, tables et rôles modifiés depuis la dernière décision,
 * et les menaces qui les citent plus les champs nouveaux. Réservé à l'équipe et au designer.
 */
export const staleSecuritySchema = z.object({
  changes: z
    .array(z.object({ id: z.string(), change: z.enum(["added", "removed", "changed"]) }))
    .max(STALE_TECHNICAL_MAX),
  items: z.array(z.string()).max(STALE_TECHNICAL_MAX),
});

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
  /**
   * Fonctionnalités, règles et tables citées par la source du livrable et modifiées (ou ajoutées, ou retirées) depuis sa dernière
   * décision (3.7.0 Données, 3.11.0 Architecture : `T-` en plus).
   */
  staleUpstream: z
    .array(z.string().regex(/^(F|R)-\d{3,}$|^T-[a-z0-9-]+$/))
    .max(20)
    .optional(),
  /** Architecture à revoir (3.11.0) : composants et flux concernés par ces changements, 50 au plus chacun. */
  staleComponents: z.array(componentIdSchema).max(50).optional(),
  staleFlows: z.array(archFlowIdSchema).max(50).optional(),
  staleTechnical: staleTechnicalSchema.optional(),
  staleSecurity: staleSecuritySchema.optional(),
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
