import { z } from "zod";
import { criterionId, endpointId, featureId, roleId, screenId } from "./ids.ts";

export const AnnotationSchema = z.strictObject({
  feature: featureId,
  critere: criterionId.optional(),
  donnee: z.string().optional(),
  endpoint: endpointId.optional(),
  comportement: z.string().optional(),
});

/** Nœud d'arbre : seules les clés utiles aux règles sont typées, les autres passent (R7). */
export const NodeSchema = z.looseObject({
  id: z.string().optional(),
  composant: z.string().min(1),
  get enfants() {
    return z.array(NodeSchema).optional();
  },
  annotations: z.array(AnnotationSchema).optional(),
});

export const ScreenSchema = z.strictObject({
  id: screenId,
  features: z.array(featureId).default([]),
  roles: z.array(roleId).default([]),
  viewport: z.array(z.string()).optional(),
  arbre: NodeSchema,
  etats: z.array(z.string()).default([]),
});

export const TestScenarioSchema = z.strictObject({
  feature: featureId,
  type: z.enum(["e2e", "contrat", "visuel"]),
  fichier: z.string().min(1),
  criteres: z.array(criterionId),
});

export type Annotation = z.output<typeof AnnotationSchema>;
export type SpecNode = z.output<typeof NodeSchema>;
export type Screen = z.output<typeof ScreenSchema>;
export type TestScenario = z.output<typeof TestScenarioSchema>;
