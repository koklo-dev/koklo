import { z } from "zod";
import { AROUND_WITH_CURSOR_MESSAGE, listInputShape, noAroundWithCursor } from "./schemas-lists.ts";
import {
  idempotencyKeySchema,
  LAYOUT_COORD_MAX,
  LAYOUT_MAX_ENTRIES,
  searchQuerySchema,
  ZONE_PREVIEW_MAX,
  ZONE_TABLES_MAX,
  zoneIdSchema,
} from "./schemas-spec-data.ts";

/**
 * Architecture (TK-111, contrat 3.9.0, additif, B506 à B515). Valeurs et motifs identiques à ceux de @koklo/schema
 * (parité vérifiée par apps/api/test). Les identifiants `C-<slug>` et `ADR-<nnn>` sont attribués par le serveur à la
 * création ; un flux technique porte le `P-<slug>` du parcours qu'il détaille. Aucune réponse ne rend de YAML ni de
 * Mermaid : seuls les champs lisibles de l'écran sortent.
 */
const slug = "[a-z0-9][a-z0-9-]*";
const roleLink = z.string().regex(new RegExp(`^RL-${slug}$`));
export const componentIdSchema = z.string().regex(new RegExp(`^C-${slug}$`));
export const adrIdSchema = z.string().regex(/^ADR-\d{3,}$/);
export const archFlowIdSchema = z.string().regex(new RegExp(`^P-${slug}$`));
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
export const adrLinkSchema = z
  .string()
  .regex(new RegExp(`^(F-\\d{3,}|R-\\d{3,}|T-${slug}|C-${slug}|P-${slug})$`));

export const COMPONENT_TYPES = ["app", "service", "store", "queue", "ext"] as const;
export const componentTypeSchema = z.enum(COMPONENT_TYPES);
export const DOC_SECTION_STATUSES = ["brouillon", "a_relire", "validee", "a_rediger"] as const;
/** Livrables qui portent un document en sections (`doc.section.*`, TK-115) ; absent d'une opération : l'architecture. */
export const DOC_SECTION_DELIVERABLES = ["architecture", "technical", "security"] as const;
const docSectionDeliverableSchema = z.enum(DOC_SECTION_DELIVERABLES).optional();
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
  /** 200 liens au plus (TK-114b, B615) : une mise à jour par l'agent porte l'index ∪ ajouts. */
  owns: z.array(tableLink).max(200),
  serves: z.array(featureLink).max(200),
  /** Rôles `RL-` qui entrent par ce composant, lus pour `type: app` (TK-114d, contrat 3.14.0, B650) ; remplace la liste. */
  actors: z.array(roleLink).max(20),
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
  .extend({ kind: z.literal("archflow.create"), flow: archFlowIdSchema });
export const archflowUpdateSchema = z
  .object(archflowFields)
  .partial()
  .extend({ kind: z.literal("archflow.update"), specId: archFlowIdSchema })
  .refine(
    (op) =>
      Object.keys(archflowFields).some((key) => (op as Record<string, unknown>)[key] !== undefined),
    { message: "au moins un champ modifié" },
  );
export const archflowDeleteSchema = z.object({
  kind: z.literal("archflow.delete"),
  specId: archFlowIdSchema,
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
  deliverable: docSectionDeliverableSchema,
  title: text(200),
  markdown: text(8000),
  status: docSectionStatusSchema.optional(),
});
export const docSectionUpdateSchema = z
  .object({
    kind: z.literal("doc.section.update"),
    specId: docSectionIdSchema,
    deliverable: docSectionDeliverableSchema,
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
  deliverable: docSectionDeliverableSchema,
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

// --- TK-112 (contrat 3.10.0, additif, B541 à B550) : schéma en couches et flux en séquence ---
/** Un nœud du schéma : un composant (`C-<slug>`) ou un acteur (`RL-<slug>`). */
const nodeIdSchema = z.union([componentIdSchema, roleLink]);
/** Bornes des lectures : celles de TK-110 (aperçu 7, composants d'une zone 200, résultats de recherche 20). */
export const ARCHITECTURE_ZONE_PREVIEW_MAX = ZONE_PREVIEW_MAX;
export const ARCHITECTURE_ZONE_COMPONENTS_MAX = ZONE_TABLES_MAX;
export const ARCHITECTURE_SEARCH_MAX = 20;

const zoneBase = {
  id: zoneIdSchema,
  name: z.string().min(1).max(120),
  /** Nom d'icône du registre (`architecture/_zones.yaml`), `folder_open` sans fichier. */
  icon: z.string().min(1).max(64),
  componentCount: z.number().int().min(0),
};

export const architectureZonesInputSchema = architectureDocumentInputSchema;
export const architectureZoneEntrySchema = z.object({
  ...zoneBase,
  /** Rôles `RL-` qui participent à un flux contenant un composant de la zone. */
  actorCount: z.number().int().min(0),
  /** Noms des premiers composants, 7 au plus. */
  preview: z.array(z.string()).max(ARCHITECTURE_ZONE_PREVIEW_MAX),
  /** Liens vers les autres zones : paires de composants reliés par `depend_de`. */
  links: z.array(z.object({ to: zoneIdSchema, count: z.number().int().min(1) })),
});
export const architectureZonesSchema = z.object({
  zones: z.array(architectureZoneEntrySchema),
  componentCount: z.number().int().min(0),
  commitSha: commitShaSchema,
});

export const architectureZoneInputSchema = z
  .object({ projectId: z.uuid(), zone: zoneIdSchema, ...revision })
  .refine(exclusiveRevision, REVISION_MESSAGE);
export const architectureZoneComponentSchema = z.object({
  specId: componentIdSchema,
  name: z.string(),
  type: componentTypeSchema,
  responsibility: z.string(),
});
export const architectureZoneSchema = z.object({
  zone: z.object(zoneBase),
  components: z.array(architectureZoneComponentSchema).max(ARCHITECTURE_ZONE_COMPONENTS_MAX),
  /** Dépendances entre les composants rendus (`async` : appel asynchrone). */
  relations: z.array(
    z.object({
      from: componentIdSchema,
      to: componentIdSchema,
      via: z.string(),
      async: z.boolean().optional(),
    }),
  ),
  actors: z.array(z.object({ id: roleLink, name: z.string() })),
  outgoing: z.array(z.object({ zone: zoneIdSchema, count: z.number().int().min(1) })),
  /**
   * Liens entre un composant de la zone et un composant d'une autre zone, dans les deux sens (TK-114c, contrat 3.13.0,
   * B640) : `zone` est l'identifiant de l'autre zone.
   */
  crossRelations: z.array(
    z.object({
      from: componentIdSchema,
      to: componentIdSchema,
      via: z.string(),
      async: z.boolean().optional(),
      zone: zoneIdSchema,
    }),
  ),
  /** Rôle → application rendue de la zone (TK-114d, contrat 3.14.0, B654) : trait sans étiquette. */
  actorRelations: z.array(z.object({ from: roleLink, to: componentIdSchema })),
  truncated: z.boolean(),
  commitSha: commitShaSchema,
});

export const architectureSearchInputSchema = z
  .object({ projectId: z.uuid(), q: searchQuerySchema, ...revision })
  .refine(exclusiveRevision, REVISION_MESSAGE);
export const architectureSearchSchema = z.object({
  items: z
    .array(
      z.object({
        specId: componentIdSchema,
        name: z.string(),
        type: componentTypeSchema,
        zone: z.string().optional(),
      }),
    )
    .max(ARCHITECTURE_SEARCH_MAX),
});

/** Positions des nœuds déplacés (`architecture/_layout.yaml`, mêmes bornes que les Données, B542). */
const archCoordinateSchema = z.number().int().min(0).max(LAYOUT_COORD_MAX);
export const architectureLayoutPositionsSchema = z
  .record(nodeIdSchema, z.strictObject({ x: archCoordinateSchema, y: archCoordinateSchema }))
  .refine((positions) => Object.keys(positions).length <= LAYOUT_MAX_ENTRIES, {
    message: `au plus ${LAYOUT_MAX_ENTRIES} nœuds positionnés`,
  });
export const architectureLayoutGetInputSchema = architectureDocumentInputSchema;
/** Fichier absent de la tête : `positions` vide. */
export const architectureLayoutSchema = z.object({
  positions: architectureLayoutPositionsSchema,
  commitSha: commitShaSchema,
});
/** Le client écrit tout le plan à chaque dépôt (dernier écrit gagne, aucun `baseSha`). */
export const architectureLayoutSaveInputSchema = z.object({
  projectId: z.uuid(),
  idempotencyKey: idempotencyKeySchema,
  positions: architectureLayoutPositionsSchema,
});
/** `commitSha` nul : le lot est enregistré mais le worker ne l'a pas encore commité (délai d'attente dépassé). */
export const architectureLayoutSavedSchema = z.object({ commitSha: commitShaSchema.nullable() });

/** Liste des flux : pages de 50, `q` sur toute la tête, `around` amène un flux (`?f=P-xxx`). */
export const architectureFlowsListInputSchema = z
  .object({ projectId: z.uuid(), ...revision, ...listInputShape(archFlowIdSchema) })
  .refine(exclusiveRevision, REVISION_MESSAGE)
  .refine(noAroundWithCursor, AROUND_WITH_CURSOR_MESSAGE);
export const architectureFlowSummarySchema = z.object({
  specId: archFlowIdSchema,
  /** Titre du parcours `P-` (repli : l'identifiant). */
  title: z.string(),
  /** Acteur du parcours (repli : le premier rôle participant). */
  actor: z.string(),
  componentCount: z.number().int().min(0),
  externalCount: z.number().int().min(0),
});

export const ARCHITECTURE_PARTICIPANT_TYPES = [
  "actor",
  "app",
  "service",
  "store",
  "queue",
  "ext",
] as const;
const flowMessageShape = {
  from: participantSchema,
  to: participantSchema,
  text: z.string(),
  reply: z.string().optional(),
  error: z.string().optional(),
};
const flowMessageSchema = z.object(flowMessageShape);
export const architectureFlowItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("message"), ...flowMessageShape }),
  z.object({
    kind: z.literal("alt"),
    label: z.string(),
    messages: z.array(flowMessageSchema),
  }),
  z.object({ kind: z.literal("separator"), label: z.string() }),
]);
export const architectureFlowsByIdInputSchema = z
  .object({ projectId: z.uuid(), flowId: archFlowIdSchema, ...revision })
  .refine(exclusiveRevision, REVISION_MESSAGE);
/** Détail d'un flux : lu par la page Flux et rendu par `spec.item.get` (type `archflow`, B545). */
export const archflowDetailSchema = z.object({
  specId: archFlowIdSchema,
  title: z.string(),
  actor: z.string(),
  participants: z.array(
    z.object({
      id: participantSchema,
      name: z.string(),
      type: z.enum(ARCHITECTURE_PARTICIPANT_TYPES),
    }),
  ),
  items: z.array(architectureFlowItemSchema),
  features: z.array(featureLink),
  rules: z.array(ruleLink),
  decisions: z.array(adrIdSchema),
  filePath: z.string(),
  commitSha: commitShaSchema,
});

export const ARCHITECTURE_SOURCE_KINDS = ["component", "flow", "schema"] as const;
export const ARCHITECTURE_FLOW_FORMATS = ["yaml", "mermaid"] as const;
const sourceTargetSchema = z.object({
  kind: z.enum(ARCHITECTURE_SOURCE_KINDS),
  id: z.string().min(1).max(100).optional(),
});
const SOURCE_ID: Record<"component" | "flow", z.ZodType<string>> = {
  component: componentIdSchema,
  flow: archFlowIdSchema,
};
/**
 * YAML d'un composant, YAML ou Mermaid d'un flux (`format`, YAML par défaut), Mermaid du schéma : équipe seulement (403
 * client et business). `id` est requis pour un composant et un flux, absent pour le schéma.
 */
export const architectureSourceInputSchema = z
  .object({
    projectId: z.uuid(),
    target: sourceTargetSchema,
    format: z.enum(ARCHITECTURE_FLOW_FORMATS).optional(),
    ...revision,
  })
  .refine(exclusiveRevision, REVISION_MESSAGE)
  .refine(
    ({ target }) =>
      target.kind === "schema"
        ? target.id === undefined
        : SOURCE_ID[target.kind].safeParse(target.id).success,
    { message: "id ne correspond pas au type", path: ["target", "id"] },
  );
/** `generated` : le fichier est absent du dépôt, le texte est produit depuis l'index. */
export const architectureSourceSchema = z.object({
  path: z.string(),
  text: z.string(),
  commitSha: commitShaSchema,
  generated: z.boolean(),
});

// --- TK-113 (contrat 3.11.0, additif, B575 à B592) : décisions d'architecture ---
const adrDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Liste des décisions : pages de 50, `q` sur toute la tête, filtres de statut, de composant et de période, `around` amène `?d=ADR-nnn`. */
export const adrListInputSchema = z
  .object({
    projectId: z.uuid(),
    status: adrStatusSchema.optional(),
    /** Décisions qui citent ce composant dans leurs liens, ou que ce composant cite. */
    component: componentIdSchema.optional(),
    from: adrDate.optional(),
    to: adrDate.optional(),
    ...revision,
    ...listInputShape(adrIdSchema),
  })
  .refine(exclusiveRevision, REVISION_MESSAGE)
  .refine(noAroundWithCursor, AROUND_WITH_CURSOR_MESSAGE);
export const adrSummarySchema = z.object({
  specId: adrIdSchema,
  title: z.string(),
  status: adrStatusSchema,
  date: z.string(),
  /** Liens de la décision (composants, fonctionnalités, règles, tables, parcours), dans l'ordre du fichier. */
  links: z.array(adrLinkSchema),
  supersededBy: adrIdSchema.optional(),
  filePath: z.string(),
});
export const adrByIdInputSchema = z
  .object({ projectId: z.uuid(), adrId: adrIdSchema, ...revision })
  .refine(exclusiveRevision, REVISION_MESSAGE);
/** Fiche d'une décision : lue par l'onglet Décisions et rendue par `spec.item.get` (type `adr`). Texte brut, jamais interprété. */
export const adrDetailSchema = z.object({
  specId: adrIdSchema,
  title: z.string(),
  status: adrStatusSchema,
  date: z.string(),
  deciders: z.array(z.string()),
  context: z.string(),
  decision: z.string(),
  consequences: z.object({ positive: z.array(z.string()), toAccept: z.array(z.string()) }),
  alternatives: z.array(z.object({ name: z.string(), reason: z.string() })),
  links: z.array(adrLinkSchema),
  /** Décision remplaçante, et sa date (celle de la remplaçante) pour la phrase « Remplacée par … le … ». */
  supersededBy: adrIdSchema.optional(),
  supersededOn: adrDate.optional(),
  /** Explication « En clair » montrée au client. */
  plain: z.string().optional(),
  filePath: z.string(),
  commitSha: commitShaSchema,
});
