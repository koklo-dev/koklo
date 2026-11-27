import { z } from "zod";
import { PATTERNS } from "../entities/ids.ts";
import {
  OPERATION_FIELD_NAME,
  STACK_ICONS,
  stackProblems,
  VARIABLE_NAME,
} from "../entities/technical.ts";
import { anyOf, keysOf, link, links, oneLine, text } from "./fields.ts";

/**
 * Types `stack`, `op`, `nfr`, `env` du livrable Technique (TK-115) : les noms des champs et les vocabulaires, en anglais,
 * suivent ceux des opérations `stack.*`, `op.*`, `nfr.*`, `env.*` ; `TECHNICAL_PROPOSAL_VOCABULARY` les traduit dans les
 * valeurs des fichiers. `specId` est posé par le code seul sur un élément repris.
 */
export const TECHNICAL_PROPOSAL_VOCABULARY = {
  layer: {
    applications: "applications",
    services: "services",
    data: "donnees",
    external: "externes",
    operations: "exploitation",
  },
  stackStatus: { chosen: "choisi", open: "a_trancher" },
  operationType: { read: "lecture", write: "ecriture", internal: "interne" },
  category: {
    data: "donnees",
    performance: "performance",
    security: "securite",
    availability: "disponibilite",
    accessibility: "accessibilite",
    operations: "exploitation",
  },
  verification: {
    scenario: "scenario",
    ci_measure: "mesure_ci",
    manual: "manuel",
    to_define: "a_definir",
  },
  environmentData: {
    sample: "jeux_exemple",
    anonymized: "copie_anonymisee",
    real: "reelles",
  },
  deployment: { merge: "fusion", version: "validation", manual: "manuel" },
  integrationStatus: {
    to_choose: "a_trancher",
    account_to_create: "compte_a_creer",
    configured: "configure",
    connected: "connecte",
  },
} as const;

const criterion = z
  .object({
    label: oneLine(120),
    estimate: z.boolean().optional(),
    values: z.array(oneLine(200)).min(2).max(4),
  })
  .strict();

const PROPOSAL_KEYS = {
  choice: "choice",
  recommended: "recommended",
  criteria: "criteria",
  values: "values",
};

export const stackProposalSchema = z
  .object({
    specId: link(PATTERNS.stack).optional(),
    role: oneLine(120),
    layer: keysOf(TECHNICAL_PROPOSAL_VOCABULARY.layer).optional(),
    icon: z.enum(STACK_ICONS).optional(),
    components: links(PATTERNS.component),
    status: keysOf(TECHNICAL_PROPOSAL_VOCABULARY.stackStatus),
    choice: oneLine(200).optional(),
    recommended: oneLine(120).optional(),
    options: z.array(oneLine(120)).min(2).max(4),
    criteria: z.array(criterion).max(8),
    why: text(1000),
    plain: text(500).optional(),
    requirements: links(PATTERNS.nfr),
    decisions: links(PATTERNS.adr),
  })
  .strict()
  .superRefine((stack, ctx) => {
    const coherence = {
      chosen: stack.status === "chosen",
      choice: stack.choice,
      recommended: stack.recommended,
      options: stack.options,
      criteriaValues: stack.criteria.map((entry) => entry.values),
    };
    for (const problem of stackProblems(coherence, PROPOSAL_KEYS)) {
      ctx.addIssue({ code: "custom", ...problem });
    }
  });

const field = z.string().max(80).regex(OPERATION_FIELD_NAME);

export const operationProposalSchema = z
  .object({
    specId: link(PATTERNS.operation).optional(),
    name: z.string().max(120).regex(PATTERNS.operation),
    type: keysOf(TECHNICAL_PROPOSAL_VOCABULARY.operationType),
    zone: oneLine(120),
    component: link(PATTERNS.component),
    summary: oneLine(500),
    permission: anyOf(/^(public|internal)$/, PATTERNS.permission),
    input: z
      .array(z.object({ field, type: oneLine(120), constraint: oneLine(300).optional() }).strict())
      .max(40),
    output: z
      .array(z.object({ field, type: oneLine(120), note: oneLine(300).optional() }).strict())
      .max(40),
    errors: z
      .array(
        z
          .object({
            code: oneLine(80),
            when: oneLine(300),
            rule: link(PATTERNS.rule).optional(),
          })
          .strict(),
      )
      .max(20),
    rules: links(PATTERNS.rule),
    features: links(PATTERNS.feature),
    rateLimit: oneLine(200).optional(),
  })
  .strict();

export const nfrProposalSchema = z
  .object({
    specId: link(PATTERNS.nfr).optional(),
    category: keysOf(TECHNICAL_PROPOSAL_VOCABULARY.category),
    title: oneLine(200),
    target: oneLine(120),
    statement: text(1000),
    verification: keysOf(TECHNICAL_PROPOSAL_VOCABULARY.verification),
    verificationDetail: oneLine(300).optional(),
    links: z.array(anyOf(PATTERNS.component, PATTERNS.stack, PATTERNS.adr, PATTERNS.rule)).max(30),
  })
  .strict();

export const environmentProposalSchema = z
  .object({
    specId: link(PATTERNS.environment).optional(),
    name: oneLine(120),
    address: oneLine(200),
    hosting: oneLine(200),
    database: oneLine(200),
    data: keysOf(TECHNICAL_PROPOSAL_VOCABULARY.environmentData),
    deployment: keysOf(TECHNICAL_PROPOSAL_VOCABULARY.deployment).optional(),
    access: oneLine(200).optional(),
    extras: z
      .array(z.object({ label: oneLine(80), value: oneLine(200) }).strict())
      .max(12)
      .optional(),
    variables: z
      .array(z.object({ name: link(VARIABLE_NAME), usage: oneLine(200) }).strict())
      .max(40)
      .optional(),
    integrations: z
      .array(
        z
          .object({
            service: oneLine(120),
            usage: oneLine(200),
            status: keysOf(TECHNICAL_PROPOSAL_VOCABULARY.integrationStatus),
          })
          .strict(),
      )
      .max(20)
      .optional(),
  })
  .strict();
