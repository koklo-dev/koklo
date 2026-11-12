import { z } from "zod";
import { PATTERNS } from "../entities/ids.ts";
import { safeText } from "./ai-text-policy.ts";

/**
 * Types `rule`, `role`, `flow` (TK-103, B342) : charges enrichies, tout champ ajouté est optionnel. Les noms des champs
 * suivent ceux des propositions de fonctionnalité (anglais) ; la conversion vers les opérations de spec se fait à
 * l'enregistrement (`rule.create`, `role.create`, `flow.create`).
 */
const featureLink = z.string().regex(PATTERNS.feature);
const oneLine = (max: number) => safeText({ min: 1, max });

export const ruleProposalSchema = z
  .object({
    title: safeText({ min: 1, max: 200 }),
    statement: safeText({ min: 1, max: 2000, multiline: true }),
    type: z.enum(["contrainte", "calcul", "workflow"]).optional(),
    example: safeText({ min: 1, max: 1000, multiline: true }).optional(),
    /** Noms des états d'un workflow ; le premier est l'état initial. */
    states: z.array(oneLine(120)).max(20).optional(),
    features: z.array(featureLink).max(20).optional(),
  })
  .strict();

export const roleProposalSchema = z
  .object({
    name: safeText({ min: 1, max: 120 }),
    description: safeText({ min: 0, max: 2000, multiline: true }),
    permissions: z
      .array(
        z
          .object({
            id: z.string().regex(PATTERNS.permission),
            restriction: oneLine(200).optional(),
          })
          .strict(),
      )
      .max(60)
      .optional(),
  })
  .strict();

export const flowProposalSchema = z
  .object({
    title: safeText({ min: 1, max: 200 }),
    steps: z
      .array(safeText({ min: 1, max: 500 }))
      .min(1)
      .max(30),
    actor: oneLine(120).optional(),
    start: oneLine(200).optional(),
    errors: z
      .array(z.object({ step: z.number().int().min(1).max(30), text: oneLine(300) }).strict())
      .max(20)
      .optional(),
    features: z.array(featureLink).max(20).optional(),
  })
  .strict();
