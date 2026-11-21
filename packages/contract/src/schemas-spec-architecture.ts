import { z } from "zod";
import { AROUND_WITH_CURSOR_MESSAGE, listInputShape, noAroundWithCursor } from "./schemas-lists.ts";

/**
 * Architecture (TK-111, contrat 3.9.0, additif, B506 à B515). Valeurs et motifs identiques à ceux de @koklo/schema
 * (parité vérifiée par apps/api/test). Les identifiants `C-<slug>` et `ADR-<nnn>` sont attribués par le serveur à la
 * création ; un flux technique porte le `P-<slug>` du parcours qu'il détaille. Aucune réponse ne rend de YAML ni de
 * Mermaid : seuls les champs lisibles de l'écran sortent.
 */
const slug = "[a-z0-9][a-z0-9-]*";
export const componentIdSchema = z.string().regex(new RegExp(`^C-${slug}$`));
export const adrIdSchema = z.string().regex(/^ADR-\d{3,}$/);
const flowLink = z.string().regex(new RegExp(`^P-${slug}$`));
const featureLink = z.string().regex(/^F-\d{3,}$/);
const ruleLink = z.string().regex(/^R-\d{3,}$/);
const tableLink = z.string().regex(new RegExp(`^T-${slug}$`));
const participantSchema = z.string().regex(new RegExp(`^(C-${slug}|RL-${slug})$`));
/** Identifiant d'une section du document : `DOC-<slug>`, le slug du fichier `architecture/overview/NN-<slug>.md` sans son numéro. */
export const docSectionIdSchema = z
  .string()
  .regex(new RegExp(`^DOC-${slug}$`))
  .max(64);
const docSectionSlugSchema = z
  .string()
  .regex(new RegExp(`^${slug}$`))
  .max(60);
const adrLinkSchema = z
  .string()
  .regex(new RegExp(`^(F-\\d{3,}|R-\\d{3,}|T-${slug}|C-${slug}|P-${slug})$`));

export const COMPONENT_TYPES = ["app", "service", "store", "queue", "ext"] as const;
export const componentTypeSchema = z.enum(COMPONENT_TYPES);
export const DOC_SECTION_STATUSES = ["brouillon", "a_relire", "validee", "a_rediger"] as const;
export const docSectionStatusSchema = z.enum(DOC_SECTION_STATUSES);

const text = (max: number) => z.string().min(1).max(max);

// --- Écriture ---
const dependencySchema = z.object({
  to: componentIdSchema,
  via: text(120),
  /** Vrai : appel asynchrone (file, événement), seul mode qui échappe à la détection de cycle. */
  async: z.boolean().optional(),
});

const componentFields = {
  name: text(120),
  type: componentTypeSchema,
  zone: text(120),
  responsibility: text(500),
  owns: z.array(tableLink).max(50),
  serves: z.array(featureLink).max(50),
  dependsOn: z.array(dependencySchema).max(30),
  decisions: z.array(adrIdSchema).max(20),
  /** Phrases simples montrées au client (vue client, TK-114) ; remplace la liste précédente. */
  clientSummary: z.array(text(200)).max(12),
};
export const componentCreateSchema = z
  .object(componentFields)
  .partial()
  .required({ name: true, type: true, zone: true, responsibility: true })
  .extend({ kind: z.literal("component.create") });
export const componentUpdateSchema = z
  .object(componentFields)
  .partial()
  .extend({ kind: z.literal("component.update"), specId: componentIdSchema })
  .refine(
    (op) =>
      Object.keys(componentFields).some(
        (key) => (op as Record<string, unknown>)[key] !== undefined,
      ),
    { message: "au moins un champ modifié" },
  );
export const componentDeleteSchema = z.object({
  kind: z.literal("component.delete"),
  specId: componentIdSchema,
});

const messageSchema = z.object({
  from: participantSchema,
  to: participantSchema,
  text: text(300),
  reply: text(300).optional(),
  error: text(300).optional(),
});
const altBlockSchema = z.object({
  block: z.literal("alt"),
  label: text(200),
  messages: z.array(messageSchema).min(1).max(20),
});
const separatorSchema = z.object({ block: z.literal("separator"), label: text(200) });
const flowItemSchema = z.union([messageSchema, altBlockSchema, separatorSchema]);
const archflowFields = {
  participants: z.array(participantSchema).min(2).max(12),
  messages: z.array(flowItemSchema).min(1).max(60),
  features: z.array(featureLink).max(20),
  rules: z.array(ruleLink).max(20),
  decisions: z.array(adrIdSchema).max(20),
};
/** Le flux d'un parcours : `flow` est le `P-<slug>` du parcours, c'est aussi l'identifiant du flux (B507). */
export const archflowCreateSchema = z
  .object(archflowFields)
  .partial()
  .required({ participants: true, messages: true })
  .extend({ kind: z.literal("archflow.create"), flow: flowLink });
export const archflowUpdateSchema = z
  .object(archflowFields)
  .partial()
  .extend({ kind: z.literal("archflow.update"), specId: flowLink })
  .refine(
    (op) =>
      Object.keys(archflowFields).some((key) => (op as Record<string, unknown>)[key] !== undefined),
    { message: "au moins un champ modifié" },
  );
export const archflowDeleteSchema = z.object({
  kind: z.literal("archflow.delete"),
  specId: flowLink,
});

export const ADR_STATUSES = ["proposee", "acceptee", "remplacee"] as const;
export const adrStatusSchema = z.enum(ADR_STATUSES);
const adrFields = {
  title: text(200),
  context: text(2000),
  decision: text(2000),
  positives: z.array(text(300)).max(10),
  accepted: z.array(text(300)).max(10),
  alternatives: z.array(z.object({ name: text(120), reason: text(300) })).max(6),
  plain: text(1000),
  links: z.array(adrLinkSchema).max(30),
  status: adrStatusSchema,
  supersededBy: adrIdSchema,
};
export const adrCreateSchema = z
  .object(adrFields)
  .partial()
  .required({ title: true, context: true, decision: true })
  .extend({ kind: z.literal("adr.create") });
export const adrUpdateSchema = z
  .object(adrFields)
  .partial()
  .extend({ kind: z.literal("adr.update"), specId: adrIdSchema })
  .refine(
    (op) =>
      Object.keys(adrFields).some((key) => (op as Record<string, unknown>)[key] !== undefined),
    { message: "au moins un champ modifié" },
  );
export const adrDeleteSchema = z.object({ kind: z.literal("adr.delete"), specId: adrIdSchema });

/** Section du document `architecture/overview/NN-<slug>.md` : le numéro NN est posé par le worker (B508). */
export const docSectionCreateSchema = z.object({
  kind: z.literal("doc.section.create"),
  title: text(200),
  markdown: text(8000),
  status: docSectionStatusSchema.optional(),
});
export const docSectionUpdateSchema = z
  .object({
    kind: z.literal("doc.section.update"),
    specId: docSectionIdSchema,
    title: text(200).optional(),
    markdown: text(8000).optional(),
    status: docSectionStatusSchema.optional(),
  })
  .refine((op) => op.title !== undefined || op.markdown !== undefined || op.status !== undefined, {
    message: "au moins un champ modifié",
  });
export const docSectionDeleteSchema = z.object({
  kind: z.literal("doc.section.delete"),
  specId: docSectionIdSchema,
});

export const ARCHITECTURE_OPERATION_KINDS = [
  "component.create",
  "component.update",
  "component.delete",
  "archflow.create",
  "archflow.update",
  "archflow.delete",
  "adr.create",
  "adr.update",
  "adr.delete",
  "doc.section.create",
  "doc.section.update",
  "doc.section.delete",
] as const;

// --- Lecture : fiche d'un composant (panneau d'édition, `spec.item.get`) ---
const commitShaSchema = z.string().regex(/^[0-9a-f]{40}$/);
export const componentDetailSchema = z.object({
  specId: componentIdSchema,
  name: z.string(),
  type: componentTypeSchema,
  zone: z.string(),
  responsibility: z.string(),
  owns: z.array(tableLink),
  serves: z.array(featureLink),
  dependsOn: z.array(dependencySchema),
  decisions: z.array(adrIdSchema),
  clientSummary: z.array(z.string()).optional(),
  filePath: z.string(),
  commitSha: commitShaSchema,
});

// --- Lecture : onglets Composants et Document ---
const revision = { branch: z.string().min(1).optional(), commitSha: commitShaSchema.optional() };
const exclusiveRevision = (value: { branch?: string; commitSha?: string }) =>
  value.branch === undefined || value.commitSha === undefined;
const REVISION_MESSAGE = "branch et commitSha sont exclusifs";

/** Pages de 50 (socle TK-94) : `q` cherche sur toute la tête, `zone` filtre, `around` amène un composant (`?c=C-xxx`). */
export const architectureComponentsListInputSchema = z
  .object({
    projectId: z.uuid(),
    zone: z.string().min(1).max(120).optional(),
    ...revision,
    ...listInputShape(componentIdSchema),
  })
  .refine(exclusiveRevision, REVISION_MESSAGE)
  .refine(noAroundWithCursor, AROUND_WITH_CURSOR_MESSAGE);
export const architectureComponentSummarySchema = z.object({
  specId: componentIdSchema,
  name: z.string(),
  type: componentTypeSchema,
  zone: z.string(),
  /** Première ligne de la responsabilité. */
  responsibility: z.string(),
  dependsOnCount: z.number().int().min(0),
  decisions: z.array(adrIdSchema),
  filePath: z.string(),
});

export const architectureDocumentInputSchema = z
  .object({ projectId: z.uuid(), ...revision })
  .refine(exclusiveRevision, REVISION_MESSAGE);
export const architectureDocSectionSchema = z.object({
  specId: docSectionIdSchema,
  slug: docSectionSlugSchema,
  /** Numéro d'ordre (préfixe NN du fichier). */
  num: z.number().int().min(0),
  path: z.string(),
  title: z.string(),
  status: docSectionStatusSchema,
  markdown: z.string(),
  updatedAt: z.string().nullable(),
  lastAuthor: z.string().nullable(),
});
export const architectureDocumentSchema = z.object({
  sections: z.array(architectureDocSectionSchema),
  commitSha: commitShaSchema,
});

export const ARCHITECTURE_CHECK_CODES = [
  "ARCH_TABLE_UNOWNED",
  "ARCH_TABLE_MULTI_OWNER",
  "ARCH_EXT_OWNS_TABLE",
  "ARCH_FEATURE_UNSERVED",
  "ARCH_FLOW_MISSING",
  "ARCH_SYNC_CYCLE",
] as const;
export const architectureChecksInputSchema = z.object({ projectId: z.uuid() });
/** Avertissements jamais bloquants, calculés sur l'index de tête plus les propositions en attente du lancement ouvert (B511). */
export const architectureChecksSchema = z.object({
  warnings: z.array(
    z.object({
      code: z.enum(ARCHITECTURE_CHECK_CODES),
      entityId: z.string(),
      message: z.string(),
    }),
  ),
});
