import { z } from "zod";
import { COMPONENT_TYPES } from "../entities/architecture.ts";
import { PATTERNS } from "../entities/ids.ts";
import { safeText } from "./ai-text-policy.ts";

/**
 * Types `component`, `archflow`, `adr`, `doc_section` du livrable Architecture (TK-111) : les noms des champs suivent ceux
 * des opérations `component.*`, `archflow.*`, `adr.*`, `doc.section.*` (anglais). Les identifiants `C-<slug>` et
 * `ADR-<nnn>` ne sont jamais fournis : le serveur les pose. Une charge invalide est écartée par le triage du worker.
 */
const oneLine = (max: number) => safeText({ min: 1, max });
const link = (pattern: RegExp) => z.string().regex(pattern);
const participant = z
  .string()
  .regex(new RegExp(`${PATTERNS.component.source}|${PATTERNS.role.source}`));
const adrLink = z
  .string()
  .regex(
    new RegExp(
      [PATTERNS.feature, PATTERNS.table, PATTERNS.component, PATTERNS.rule, PATTERNS.flow]
        .map((pattern) => pattern.source)
        .join("|"),
    ),
  );

/** Liens d'un composant (B615) : 200 au plus, comme les opérations `component.create|update`. */
const LINKS_MAX = 200;

/** Dépendance proposée d'un composant (TK-114c, B635) : partagée par `dependsOn` et les liens de la passe de couverture. */
export const componentDependencySchema = z
  .object({
    to: link(PATTERNS.component),
    via: oneLine(120),
    async: z.boolean().optional(),
  })
  .strict();

/**
 * `specId` (TK-114b, B615) : posé par le code seul, quand la proposition complète les liens d'un composant déjà dans l'index ;
 * le schéma envoyé au modèle l'omet et le tri du worker écarte toute sortie qui en porte un.
 */
export const componentProposalSchema = z
  .object({
    specId: link(PATTERNS.component).optional(),
    name: oneLine(120),
    type: z.enum(COMPONENT_TYPES),
    zone: oneLine(120),
    responsibility: oneLine(500),
    owns: z.array(link(PATTERNS.table)).max(LINKS_MAX).optional(),
    serves: z.array(link(PATTERNS.feature)).max(LINKS_MAX).optional(),
    dependsOn: z.array(componentDependencySchema).max(30).optional(),
    decisions: z.array(link(PATTERNS.adr)).max(20).optional(),
    clientSummary: z.array(oneLine(200)).max(12).optional(),
  })
  .strict();

const message = z
  .object({
    from: participant,
    to: participant,
    text: oneLine(300),
    reply: oneLine(300).optional(),
    error: oneLine(300).optional(),
  })
  .strict();
const altBlock = z
  .object({
    block: z.literal("alt"),
    label: oneLine(200),
    messages: z.array(message).min(1).max(20),
  })
  .strict();
const separator = z.object({ block: z.literal("separator"), label: oneLine(200) }).strict();

export const archflowProposalSchema = z
  .object({
    flow: link(PATTERNS.flow),
    participants: z.array(participant).min(2).max(12),
    messages: z
      .array(z.union([message, altBlock, separator]))
      .min(1)
      .max(60),
    features: z.array(link(PATTERNS.feature)).max(20).optional(),
    rules: z.array(link(PATTERNS.rule)).max(20).optional(),
    decisions: z.array(link(PATTERNS.adr)).max(20).optional(),
  })
  .strict();

export const adrProposalSchema = z
  .object({
    title: oneLine(200),
    context: safeText({ min: 1, max: 2000, multiline: true }),
    decision: safeText({ min: 1, max: 2000, multiline: true }),
    positives: z.array(oneLine(300)).max(10).optional(),
    accepted: z.array(oneLine(300)).max(10).optional(),
    alternatives: z
      .array(z.object({ name: oneLine(120), reason: oneLine(300) }).strict())
      .min(1)
      .max(6),
    plain: safeText({ min: 1, max: 1000, multiline: true }).optional(),
    links: z.array(adrLink).max(30).optional(),
  })
  .strict();

export const docSectionProposalSchema = z
  .object({
    title: oneLine(200),
    markdown: safeText({ min: 1, max: 8000, multiline: true }),
  })
  .strict();
