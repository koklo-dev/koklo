import { z } from "zod";
import {
  enforcementSchema,
  isProtectedBlocking,
  nonEmptyText,
  protectedBlockingIssue,
  ruleShape,
} from "./catalog-schema.ts";
import { AGENT_ROLES } from "./catalog-types.ts";
import { LAYER_LEVELS } from "./layer-types.ts";

/** Les motifs ne sont validés qu'après la forme (voir `layer-checks.ts`). */
const patterns = z.array(nonEmptyText);

export const layerRuleSchema = z
  .strictObject({
    ...ruleShape,
    paths: patterns.optional(),
    excludePaths: patterns.optional(),
    replaces: nonEmptyText.optional(),
  })
  .refine(isProtectedBlocking, protectedBlockingIssue);

const OVERRIDE_EFFECTS = [
  "severity",
  "enforcement",
  "disabled",
  "agents",
  "excludePaths",
  "protected",
] as const;

export const overrideSchema = z
  .strictObject({
    ruleId: nonEmptyText,
    author: nonEmptyText,
    justification: nonEmptyText,
    expires: z.string().optional(),
    severity: z.enum(["blocking", "advisory"]).optional(),
    enforcement: enforcementSchema.optional(),
    disabled: z.boolean().optional(),
    agents: z.array(z.enum(AGENT_ROLES)).min(1).optional(),
    excludePaths: patterns.optional(),
    protected: z.boolean().optional(),
  })
  .refine((o) => OVERRIDE_EFFECTS.some((key) => o[key] !== undefined), {
    message: "an override must change at least one field",
  });

/** `expires` est optionnel ici pour distinguer « absent » (waiver.missing-expires) de « mal formé ». */
export const waiverSchema = z.strictObject({
  ruleId: nonEmptyText,
  file: nonEmptyText,
  author: nonEmptyText,
  justification: nonEmptyText,
  expires: z.string().optional(),
});

export const layerSchema = z.strictObject({
  level: z.enum(LAYER_LEVELS),
  author: nonEmptyText.optional(),
  profiles: z.array(nonEmptyText).optional(),
  add: z.array(layerRuleSchema).optional(),
  override: z.array(overrideSchema).optional(),
  waivers: z.array(waiverSchema).optional(),
  lock: z.array(nonEmptyText).optional(),
});

export type RawLayer = z.infer<typeof layerSchema>;
export type RawWaiver = z.infer<typeof waiverSchema>;
