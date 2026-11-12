import { z } from "zod";
import { featureId, flowId, screenId } from "./ids.ts";

const step = z.strictObject({ libelle: z.string().min(1), ecran: screenId.optional() });

/** Parcours métier `design/flows/P-<slug>.yaml` (TK-103, B7 et B338 a). L'étape 1 est le point de départ. */
export const FlowSchema = z.strictObject({
  id: flowId,
  titre: z.string().min(1),
  acteur: z.string().min(1),
  depart: step,
  etapes: z.array(step).default([]),
  erreurs: z
    .array(z.strictObject({ etape: z.number().int().min(1), texte: z.string().min(1) }))
    .default([]),
  fonctionnalites: z.array(featureId).default([]),
});

export type Flow = z.output<typeof FlowSchema>;
export type FlowStep = z.output<typeof step>;
