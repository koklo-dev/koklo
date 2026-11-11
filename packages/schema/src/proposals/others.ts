import { z } from "zod";
import { safeText } from "./ai-text-policy.ts";

/**
 * Types `rule`, `role`, `flow` : le schéma, la colonne, la liste et la décision sont prêts ; leurs
 * opérations de spec et fichiers n'existent qu'au sprint 023 (B314 d) : ni générés ni enregistrables.
 */
export const ruleProposalSchema = z
  .object({
    title: safeText({ min: 1, max: 200 }),
    statement: safeText({ min: 1, max: 2000, multiline: true }),
  })
  .strict();

export const roleProposalSchema = z
  .object({
    name: safeText({ min: 1, max: 120 }),
    description: safeText({ min: 0, max: 2000, multiline: true }),
  })
  .strict();

export const flowProposalSchema = z
  .object({
    title: safeText({ min: 1, max: 200 }),
    steps: z
      .array(safeText({ min: 1, max: 500 }))
      .min(1)
      .max(30),
  })
  .strict();
