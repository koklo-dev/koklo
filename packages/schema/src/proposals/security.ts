import { z } from "zod";
import { PATTERNS } from "../entities/ids.ts";
import {
  API_SURFACE,
  ASVS_LEVELS,
  ASVS_REQUIREMENT_ID,
  asvsLink,
  SECURITY_LIMITS as MAX,
  threatLink,
} from "../entities/security.ts";
import { isSummaryText } from "../security/text.ts";
import { anyOf, keysOf, link, oneLine, text } from "./fields.ts";

/**
 * Types `threat`, `sensitive`, `right`, `asvs`, `summary` du livrable Sécurité (TK-117, B806) : champs et vocabulaires
 * anglais, traduits par `SECURITY_PROPOSAL_VOCABULARY`. Jamais de conservation (A7 : seulement une suggestion), jamais
 * d'octroi de droit (B794), jamais le niveau ASVS du projet (A6), jamais d'identifiant dans le résumé.
 */
export const SECURITY_PROPOSAL_VOCABULARY = {
  category: {
    spoofing: "usurpation",
    unauthorized_access: "acces_non_autorise",
    data_leak: "fuite_donnees",
    tampering: "alteration",
    abuse: "abus",
    compliance: "conformite",
  },
  severity: { high: "elevee", medium: "moyenne", low: "faible" },
  verification: { scenario: "scenario", ci_check: "controle_ci", human_review: "revue_humaine" },
  dataCategory: {
    personal: "personnelle",
    contact: "contact",
    sensitive: "sensible",
    secret: "secret",
    technical: "technique",
  },
  chapter: {
    authentication: "authentification",
    sessions: "sessions",
    access_control: "controle_acces",
    validation: "validation",
    cryptography: "cryptographie",
    logging: "journalisation",
    data_protection: "protection_donnees",
    configuration: "configuration",
    api: "api",
  },
  section: {
    location: "donnees",
    protection: "protection",
    access: "acces",
    signIn: "connexion",
    checks: "verification",
    incident: "incident",
  },
} as const;

const VOCABULARY = SECURITY_PROPOSAL_VOCABULARY;

export const threatProposalSchema = z
  .object({
    specId: link(PATTERNS.threat).optional(),
    title: oneLine(MAX.title),
    surfaces: z
      .array(anyOf(PATTERNS.feature, new RegExp(`^${API_SURFACE}$`)))
      .min(1)
      .max(30),
    category: keysOf(VOCABULARY.category),
    severity: keysOf(VOCABULARY.severity),
    risk: text(MAX.text),
    measures: z.array(oneLine(MAX.line)).max(30),
    verification: keysOf(VOCABULARY.verification),
    verificationDetail: oneLine(MAX.line).optional(),
    scenario: z
      .object({ when: oneLine(MAX.line), expected: oneLine(MAX.line) })
      .strict()
      .optional(),
    links: z.array(threatLink).max(50),
  })
  .strict();

export const sensitiveProposalSchema = z
  .object({
    specId: link(PATTERNS.dataField).optional(),
    data: oneLine(MAX.title),
    fields: z.array(link(PATTERNS.dataField)).min(1).max(200),
    category: keysOf(VOCABULARY.dataCategory),
    access: z.array(oneLine(MAX.label)).max(30),
    protection: text(MAX.protection).optional(),
    /** Devient `conservation_proposee` : une aide à la saisie, jamais une durée retenue. */
    retentionSuggestion: oneLine(MAX.line).optional(),
  })
  .strict();

/** Exactement une des deux formes : les clés de l'une, aucune de l'autre. */
const onlyOneForm = (
  value: Readonly<Record<string, unknown>>,
  forms: readonly (readonly string[])[],
): boolean => {
  const present = Object.keys(value).filter((key) => value[key] !== undefined);
  return forms.some(
    (form) => form.length === present.length && form.every((key) => present.includes(key)),
  );
};

/** Une restriction d'un rôle sur une permission, ou une règle de propriété. */
export const rightProposalSchema = z
  .object({
    role: link(PATTERNS.role).optional(),
    permission: link(PATTERNS.permission).optional(),
    restriction: oneLine(MAX.line).optional(),
    ownershipRule: oneLine(MAX.line).optional(),
  })
  .strict()
  .refine(
    (value) => onlyOneForm(value, [["role", "permission", "restriction"], ["ownershipRule"]]),
    "une restriction ou une règle de propriété",
  );

const requirement = z
  .object({
    specId: link(ASVS_REQUIREMENT_ID).optional(),
    chapter: keysOf(VOCABULARY.chapter),
    title: oneLine(MAX.line),
    level: z.union(ASVS_LEVELS.map((level) => z.literal(level))),
    answer: oneLine(MAX.answer).optional(),
    links: z.array(asvsLink).max(30),
  })
  .strict();

/** Une exigence (avec ou sans réponse), ou les faits « Secrets et dépendances ». */
export const asvsProposalSchema = z
  .object({
    requirement: requirement.optional(),
    facts: z
      .array(z.object({ label: oneLine(MAX.label), value: oneLine(MAX.answer) }).strict())
      .min(1)
      .max(20)
      .optional(),
  })
  .strict()
  .refine((value) => onlyOneForm(value, [["requirement"], ["facts"]]), "une exigence ou des faits");

const card = text(MAX.text).refine(isSummaryText, "contenu non autorisé");

/** Six cartes : la conservation est composée par le code depuis les durées saisies. */
export const summaryProposalSchema = z
  .object({
    location: card,
    protection: card,
    access: card,
    signIn: card,
    checks: card,
    incident: card,
  })
  .strict();

/** Titre des types sans champ `title` : la restriction ou la règle, l'exigence ou les faits, le résumé client. */
export function securityProposalTitle(
  kind: string,
  content: Readonly<Record<string, unknown>>,
): string | undefined {
  if (kind === "summary") return "Résumé client";
  if (kind === "right") {
    const text = content.ownershipRule ?? content.restriction;
    return typeof text === "string" ? text : undefined;
  }
  if (kind !== "asvs") return undefined;
  const requirement = content.requirement as { title?: unknown } | undefined;
  if (requirement === undefined) return "Secrets et dépendances";
  return typeof requirement.title === "string" ? requirement.title : undefined;
}
