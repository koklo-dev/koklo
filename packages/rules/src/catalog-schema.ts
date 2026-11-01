import { z } from "zod";
import type { Catalog, Enforcement, Profile, Rule } from "./catalog-types.ts";
import { AGENT_ROLES, PROFILE_KINDS } from "./catalog-types.ts";

/** Identifiant de règle : `domaine.nom` (minuscules, chiffres, tirets). */
export const RULE_ID_PATTERN = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;

export const nonEmptyText = z.string().min(1);

/** Types d'enforcement acceptés (miroir de la union discriminée ci-dessous). */
export const ENFORCEMENT_KINDS = ["gate", "evidence", "instruction"] as const;

export const enforcementSchema: z.ZodType<Enforcement> = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("gate"),
    adapter: nonEmptyText,
    command: nonEmptyText.optional(),
  }),
  z.strictObject({ kind: z.literal("evidence"), evidence: nonEmptyText }),
  z.strictObject({ kind: z.literal("instruction") }),
]);

export const profileSchema: z.ZodType<Profile> = z.strictObject({
  kind: z.enum(PROFILE_KINDS),
  description: nonEmptyText,
});

const hasNoDuplicate = (items: readonly string[]): boolean => new Set(items).size === items.length;

/** Champs d'une règle, partagés par le catalogue et les règles ajoutées par une couche. */
export const ruleShape = {
  id: z.string().regex(RULE_ID_PATTERN),
  title: nonEmptyText,
  description: nonEmptyText,
  profiles: z.array(nonEmptyText).min(1),
  agents: z
    .array(z.enum(AGENT_ROLES))
    .min(1)
    .refine(hasNoDuplicate, { message: "agents must be unique" }),
  severity: z.enum(["blocking", "advisory"]),
  protected: z.boolean().default(false),
  enforcement: enforcementSchema,
};

/** Une règle protégée est toujours bloquante. */
export const isProtectedBlocking = (rule: Pick<Rule, "protected" | "severity">): boolean =>
  !rule.protected || rule.severity === "blocking";

export const protectedBlockingIssue = {
  path: ["severity"],
  message: "a protected rule must be blocking",
};

export const ruleSchema: z.ZodType<Rule> = z
  .strictObject(ruleShape)
  .refine(isProtectedBlocking, protectedBlockingIssue);

export const catalogSchema: z.ZodType<Catalog> = z
  .strictObject({
    schema_version: z.literal(1),
    catalog_version: nonEmptyText,
    protected_rule_ids: z.array(nonEmptyText),
    profiles: z
      .record(nonEmptyText, profileSchema)
      .refine((profiles) => Object.keys(profiles).length > 0, { message: "no profile" }),
    rules: z.array(ruleSchema).min(1),
  })
  .transform(
    (raw): Catalog => ({
      schemaVersion: raw.schema_version,
      catalogVersion: raw.catalog_version,
      protectedRuleIds: raw.protected_rule_ids,
      profiles: raw.profiles,
      rules: raw.rules,
    }),
  );
