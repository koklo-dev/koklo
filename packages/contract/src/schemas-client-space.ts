import { z } from "zod";
import { LIST_QUERY_MAX_LENGTH, listOf, pageNumberOf } from "./schemas-lists.ts";
import {
  criterionIdSchema,
  featureIdSchema,
  featurePrioritySchema,
  stepSchema,
} from "./schemas-spec.ts";
import {
  flowErrorSchema,
  flowIdSchema,
  flowStepSchema,
  matrixActionSchema,
  roleIdSchema,
  ruleIdSchema,
  ruleTypeSchema,
} from "./schemas-spec-domain.ts";
import { pageInputSchema } from "./schemas-tickets.ts";

/**
 * Espace client (TK-55b) : vocabulaire métier seulement. `version` est un jeton opaque que le
 * client renvoie tel quel ; aucune clé ni valeur ne parle de git ou de structure interne.
 */
export const clientValidationSchema = z.enum(["validated", "to_validate", "to_revise"]);
export const clientPhaseSchema = z.enum(["framing", "iteration"]);

export const clientSpaceProjectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  phase: clientPhaseSchema,
});

export const clientSpaceProjectsInputSchema = z.object({});
export const clientSpaceProjectsOutputSchema = clientSpaceProjectSchema.array();

/** Recherche serveur sur tout l'index (TK-105, B364) : jamais seulement sur les éléments déjà chargés. */
const searchShape = { q: z.string().min(1).max(LIST_QUERY_MAX_LENGTH).optional() };

/**
 * `untreated` ne garde que les fonctionnalités encore « à valider » ; `around` amène la page de cette fonctionnalité
 * (aussi hors de la page chargée, TK-104, B350). Les deux s'excluent avec un curseur seulement pour `around`.
 */
export const clientSpaceFeaturesInputSchema = z
  .object({
    projectId: z.uuid(),
    untreated: z.enum(["true"]).optional(),
    around: featureIdSchema.optional(),
    ...searchShape,
    ...pageInputSchema,
  })
  .refine((input) => input.around === undefined || input.cursor === undefined, {
    message: "around et cursor s'excluent",
    path: ["around"],
  });

export const clientFeatureSummarySchema = z.object({
  id: featureIdSchema,
  title: z.string(),
  priority: featurePrioritySchema,
  criteriaCount: z.number().int().min(0),
  validation: clientValidationSchema,
  previouslyValidated: z.boolean(),
  openSuggestions: z.number().int().min(0),
});

export const clientSpaceFeaturesOutputSchema = z.object({
  items: z.array(clientFeatureSummarySchema),
  version: z.string().min(1),
  nextCursor: z.string().nullable(),
  /** Nombre de fonctionnalités de la liste filtrée et rang de la première de la page (0 en tête). */
  total: z.number().int().min(0),
  offset: z.number().int().min(0),
});

export const clientSpaceFeatureInputSchema = z.object({
  projectId: z.uuid(),
  featureId: featureIdSchema,
});

/** Élément lié à une fonctionnalité, par libellé (« Délai d'annulation »), jamais par chemin. */
export const clientLinkSchema = z.object({ id: z.string().min(1), label: z.string().min(1) });
/** Date de la version relue et ses sept premiers caractères (seule trace de version montrée, B348) ; jamais l'identifiant entier. */
export const clientVersionNoteSchema = z.object({
  date: z.iso.date(),
  label: z.string().length(7),
});

export const clientSpaceFeatureOutputSchema = z.object({
  id: featureIdSchema,
  title: z.string(),
  description: z.string(),
  priority: featurePrioritySchema,
  criteria: z.array(
    z.object({ id: criterionIdSchema, title: z.string(), steps: z.array(stepSchema) }),
  ),
  validation: clientValidationSchema,
  previouslyValidated: z.boolean(),
  links: z.array(clientLinkSchema),
  versionNote: clientVersionNoteSchema,
  version: z.string().min(1),
});

// --- TK-104 (3.2.0) : progression, parcours, règles et rôles du point de vue du client ---
export const clientTargetKindSchema = z.enum(["feature", "flow", "rules", "roles"]);

/** Compteurs d'un onglet : éléments affichés, unités à traiter (un bloc = une), traitées, et demandes de changement. */
export const clientTabProgressSchema = z.object({
  count: z.number().int().min(0),
  units: z.number().int().min(0),
  treated: z.number().int().min(0),
  toRevise: z.number().int().min(0),
});

export const clientSpaceProgressInputSchema = z.object({ projectId: z.uuid() });
export const clientSpaceProgressOutputSchema = z.object({
  /** Un client est invité au projet (décide qui valide, D1). */
  hasClient: z.boolean(),
  /** Le lecteur peut valider le cahier (`canReview` côté serveur) ; faux pour le business, l'équipe avec client, etc. */
  canValidate: z.boolean(),
  clientFirstName: z.string().nullable(),
  /** Statut du cahier entier (livrable Fonctionnel). */
  validation: clientValidationSchema,
  tabs: z.object({
    features: clientTabProgressSchema,
    flows: clientTabProgressSchema,
    rules: clientTabProgressSchema,
    roles: clientTabProgressSchema,
  }),
  /** Unités encore « à valider », toutes familles confondues. */
  untreated: z.number().int().min(0),
  /** Unités avec une demande de changement d'actualité. */
  toRevise: z.number().int().min(0),
  /** Unités validées dont le contenu a changé depuis (à revalider). */
  changed: z.number().int().min(0),
  /** Première unité non traitée dans l'ordre des onglets ; `null` quand tout est traité. */
  next: z.object({ kind: clientTargetKindSchema, ref: z.string().min(1) }).nullable(),
  version: z.string().min(1),
});

/** Parcours : recherche `q` (TK-105, 3.3.0). */
export const clientSpaceListInputSchema = z.object({
  projectId: z.uuid(),
  ...searchShape,
  ...pageInputSchema,
});
/** Règles : recherche `q` et filtre de type (TK-105, 3.3.0), appliqués sur tout l'index. */
export const clientSpaceRulesInputSchema = z.object({
  projectId: z.uuid(),
  type: ruleTypeSchema.optional(),
  ...searchShape,
  ...pageInputSchema,
});

export const clientRuleSchema = z.object({
  id: ruleIdSchema,
  title: z.string(),
  type: ruleTypeSchema,
  statement: z.string(),
  example: z.string().optional(),
  states: z.array(z.string()),
  features: z.array(featureIdSchema),
});
const blockState = {
  validation: clientValidationSchema,
  previouslyValidated: z.boolean(),
  version: z.string().min(1),
};
export const clientSpaceRulesOutputSchema = listOf(clientRuleSchema).extend(blockState);

export const clientFlowSchema = z.object({
  id: flowIdSchema,
  title: z.string(),
  actor: z.string(),
  start: flowStepSchema,
  steps: z.array(flowStepSchema),
  errors: z.array(flowErrorSchema),
  features: z.array(featureIdSchema),
  validation: clientValidationSchema,
  previouslyValidated: z.boolean(),
});
export const clientSpaceFlowsOutputSchema = listOf(clientFlowSchema).extend({
  version: z.string().min(1),
});

export const clientSpaceRolesInputSchema = z.object({ projectId: z.uuid() });
export const clientRoleSchema = z.object({
  id: roleIdSchema,
  name: z.string(),
  description: z.string().optional(),
});
export const clientSpaceRolesOutputSchema = z.object({
  roles: z.array(clientRoleSchema),
  actions: z.array(matrixActionSchema),
  ...blockState,
});

// --- TK-109 (3.7.0) : modèle de données validé, du point de vue du client ---
const dataTableId = z.string().regex(/^T-[a-z0-9][a-z0-9-]*$/);
const dataFixtureId = z.string().regex(/^FX-[a-z0-9][a-z0-9-]*$/);
const cellValue = z.union([z.string(), z.number(), z.boolean()]);
/** Bornes du modèle montré au client : au-delà, `truncated` (B452). */
export const CLIENT_DATA_TABLES_MAX = 100;

/** Champ vu du client : nom, type, clé et donnée personnelle seulement (ni contrainte, ni valeur, ni règle). */
export const clientDataFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  primaryKey: z.boolean(),
  personalData: z.boolean(),
});
export const clientDataTableSchema = z.object({
  id: dataTableId,
  name: z.string(),
  zone: z.string().optional(),
  description: z.string(),
  fields: z.array(clientDataFieldSchema),
  relations: z.array(
    z.object({
      to: dataTableId,
      toName: z.string(),
      cardinality: z.enum(["1 → 1", "1 → 0..1", "1 → n", "n → 1", "n ↔ n"]),
    }),
  ),
  /** « Utilisée par » : fonctionnalités et règles, par libellé. */
  usedBy: z.array(clientLinkSchema),
  /** Phrases « Ce qu'on enregistre » ; vide quand l'équipe n'en a pas écrit. */
  clientSummary: z.array(z.string()),
});
export const clientSpaceDataModelInputSchema = z.object({ projectId: z.uuid() });
/** Non validé (ou à revoir) : `available` faux, aucune table, aucune position. */
export const clientSpaceDataModelOutputSchema = z.object({
  available: z.boolean(),
  validation: clientValidationSchema,
  truncated: z.boolean(),
  items: z.array(clientDataTableSchema).max(CLIENT_DATA_TABLES_MAX),
  positions: z.record(dataTableId, z.object({ x: z.number().int(), y: z.number().int() })),
});

export const clientSpaceDataFixturesInputSchema = z.object({ projectId: z.uuid() });
export const clientSpaceDataFixturesOutputSchema = z.object({
  items: z.array(
    z.object({
      specId: dataFixtureId,
      title: z.string(),
      table: dataTableId,
      locale: z.string(),
      rowCount: z.number().int().min(0),
    }),
  ),
});
/** Lignes d'un jeu, 25 par page (même tableau paginé que l'équipe). */
export const clientSpaceDataFixtureRowsInputSchema = z.object({
  projectId: z.uuid(),
  fixtureId: dataFixtureId,
  page: z.coerce.number().int().min(1),
  size: z.coerce.number().pipe(z.literal(25)),
});
export const clientSpaceDataFixtureRowsOutputSchema = pageNumberOf(
  z.record(z.string(), cellValue),
).extend({ columns: z.array(z.string()) });
