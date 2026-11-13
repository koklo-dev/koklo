import {
  providerErrors,
  specBatchConflictError,
  specIndexFailedError,
  specInvalidError,
  validationError,
} from "./errors.ts";
import { readOneErrors, route, writeOneErrors } from "./route-helpers.ts";
import {
  specDeliverableSchema,
  specDeliverablesInputSchema,
  specDeliverablesSchema,
  specForceDeliverableInputSchema,
} from "./schemas-deliverables.ts";
import { listOf } from "./schemas-lists.ts";
import {
  featureDetailSchema,
  featureGetInputSchema,
  featureListInputSchema,
  featureSummarySchema,
  specBatchGetInputSchema,
  specBatchSchema,
  specBatchSubmitInputSchema,
  specHeadInputSchema,
  specHeadSchema,
  specItemGetInputSchema,
  specItemSchema,
  specMigrationOutputSchema,
  specMigrationRevertInputSchema,
  specMigrationStartInputSchema,
  specRefsSearchInputSchema,
  specRefsSearchOutputSchema,
} from "./schemas-spec.ts";
import {
  dataFixtureRowsInputSchema,
  dataFixtureRowsSchema,
  dataFixturesListInputSchema,
  dataFixturesListSchema,
  dataLayoutGetInputSchema,
  dataLayoutSavedSchema,
  dataLayoutSaveInputSchema,
  dataLayoutSchema,
  dataMermaidInputSchema,
  dataMermaidSchema,
  dataTableSourceInputSchema,
  dataTableSourceSchema,
  dataTableSummarySchema,
  dataTablesListInputSchema,
} from "./schemas-spec-data.ts";
import {
  functionalItemSchema,
  functionalListInputSchema,
  rolesMatrixInputSchema,
  rolesMatrixSchema,
} from "./schemas-spec-domain.ts";

/** Lecture depuis l'index en base (CDC §8.2) : ouverte à tous les rôles, 404 hors projet. */
const readIndexErrors = { ...readOneErrors, ...validationError } as const;

const spec = {
  head: route("GET", "/projects/{projectId}/spec")
    .errors(readIndexErrors)
    .input(specHeadInputSchema)
    .output(specHeadSchema),
  listFeatures: route("GET", "/projects/{projectId}/spec/features")
    .errors({ ...readIndexErrors, ...specIndexFailedError })
    .input(featureListInputSchema)
    .output(listOf(featureSummarySchema)),
  /**
   * Onglets Règles métier et Parcours (TK-103, 3.1.0, B341) : liste à curseur de l'index d'entités de la tête, filtre de type
   * (règles), recherche sur tout l'index, `around` pour le lien direct. Garde et erreurs de `spec.listFeatures`.
   */
  functional: {
    list: route("GET", "/projects/{projectId}/spec/functional")
      .errors({ ...readIndexErrors, ...specIndexFailedError })
      .input(functionalListInputSchema)
      .output(listOf(functionalItemSchema)),
  },
  /** Onglet Rôles et permissions (3.1.0) : rôles, groupes de ressources et actions de la matrice « Qui peut faire quoi ». */
  roles: {
    matrix: route("GET", "/projects/{projectId}/spec/roles/matrix")
      .errors({ ...readIndexErrors, ...specIndexFailedError })
      .input(rolesMatrixInputSchema)
      .output(rolesMatrixSchema),
  },
  /**
   * Page Données (TK-107, 3.5.0, B388, B389) : tables (liste à curseur, `q` sur le nom et les champs, `zone`, `around`),
   * texte Mermaid du modèle, jeux d'exemple et leurs lignes (25 par page). Équipe et designer en lecture (403 client et
   * business). Erreurs de `spec.listFeatures`.
   */
  data: {
    tables: {
      list: route("GET", "/projects/{projectId}/spec/data/tables")
        .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
        .input(dataTablesListInputSchema)
        .output(listOf(dataTableSummarySchema)),
      /** Fichier `data/tables/<slug>.yaml` au commit lu, sinon YAML généré (3.6.0, B417). Équipe et designer seulement. */
      source: route("GET", "/projects/{projectId}/spec/data/tables/{tableId}/source")
        .errors({
          ...writeOneErrors,
          ...validationError,
          ...specIndexFailedError,
          ...providerErrors,
        })
        .input(dataTableSourceInputSchema)
        .output(dataTableSourceSchema),
    },
    /**
     * Positions des tables du diagramme (TK-108, 3.6.0, B417, B418) : `get` lit `data/_layout.yaml` (équipe et designer) ;
     * `save` l'écrit par un lot du worker (owner, admin et développeur ; 403 pour les autres), dernier écrit gagne.
     */
    layout: {
      get: route("GET", "/projects/{projectId}/spec/data/layout")
        .errors({
          ...writeOneErrors,
          ...validationError,
          ...specIndexFailedError,
          ...providerErrors,
        })
        .input(dataLayoutGetInputSchema)
        .output(dataLayoutSchema),
      save: route("POST", "/projects/{projectId}/spec/data/layout")
        .errors({
          ...writeOneErrors,
          ...validationError,
          ...providerErrors,
          ...specBatchConflictError,
          ...specInvalidError,
        })
        .input(dataLayoutSaveInputSchema)
        .output(dataLayoutSavedSchema),
    },
    mermaid: route("GET", "/projects/{projectId}/spec/data/mermaid")
      .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
      .input(dataMermaidInputSchema)
      .output(dataMermaidSchema),
    fixtures: {
      list: route("GET", "/projects/{projectId}/spec/data/fixtures")
        .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
        .input(dataFixturesListInputSchema)
        .output(dataFixturesListSchema),
      rows: route("GET", "/projects/{projectId}/spec/data/fixtures/{fixtureId}/rows")
        .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
        .input(dataFixtureRowsInputSchema)
        .output(dataFixtureRowsSchema),
    },
  },
  getFeature: route("GET", "/projects/{projectId}/spec/features/{specId}")
    .errors({ ...readOneErrors, ...providerErrors, ...specIndexFailedError })
    .input(featureGetInputSchema)
    .output(featureDetailSchema),
  /** Les sept livrables, leur disponibilité et leur statut : tout rôle ayant accès au projet (TK-100, 2.10.0). */
  deliverables: route("GET", "/projects/{projectId}/spec/deliverables")
    .errors(readOneErrors)
    .input(specDeliverablesInputSchema)
    .output(specDeliverablesSchema),
  /** Ouvre un livrable sans rien valider : owner et admin seulement (403 sinon), idempotent, audité. */
  forceDeliverable: route("POST", "/projects/{projectId}/spec/deliverables/{key}/force")
    .errors({ ...writeOneErrors, ...validationError })
    .input(specForceDeliverableInputSchema)
    .output(specDeliverableSchema),
  /**
   * Panneau d'édition (TK-101, 2.11.0) : l'élément, l'état « validé » du Fonctionnel et les éléments qui le citent.
   * `SPEC_BATCH_ROLES` seuls (client et business : 403). Erreurs de `spec.getFeature`.
   */
  item: {
    get: route("GET", "/projects/{projectId}/spec/items/{type}/{id}")
      .errors({ ...writeOneErrors, ...validationError, ...providerErrors, ...specIndexFailedError })
      .input(specItemGetInputSchema)
      .output(specItemSchema),
  },
  /** Autocomplétion des liens : 20 résultats au plus sur l'index d'entités de la tête, aucun curseur. */
  refs: {
    search: route("GET", "/projects/{projectId}/spec/refs")
      .errors({ ...writeOneErrors, ...validationError })
      .input(specRefsSearchInputSchema)
      .output(specRefsSearchOutputSchema),
  },
};

const specBatch = {
  submit: route("POST", "/projects/{projectId}/spec/batches")
    .errors({
      ...writeOneErrors,
      ...validationError,
      ...providerErrors,
      ...specBatchConflictError,
      ...specInvalidError,
    })
    .input(specBatchSubmitInputSchema)
    .output(specBatchSchema),
  get: route("GET", "/projects/{projectId}/spec/batches/{batchId}")
    .errors(writeOneErrors)
    .input(specBatchGetInputSchema)
    .output(specBatchSchema),
};

/**
 * Migration v1 -> v2 (TK-106, 3.4.0) : owner seulement (403 sinon, garde de rôle avant le projet), audité comme tout lot.
 * Mêmes erreurs que `idea.publish`, plus la validation de l'entrée ; un défaut de la spec est rendu par `specBatch.get`
 * (lot `failed`, `SPEC_INVALID`, rapport).
 */
const migrationErrors = {
  ...writeOneErrors,
  ...validationError,
  ...providerErrors,
  ...specBatchConflictError,
} as const;

const specMigration = {
  start: route("POST", "/projects/{projectId}/spec/migration")
    .errors(migrationErrors)
    .input(specMigrationStartInputSchema)
    .output(specMigrationOutputSchema),
  revert: route("POST", "/projects/{projectId}/spec/migration/revert")
    .errors(migrationErrors)
    .input(specMigrationRevertInputSchema)
    .output(specMigrationOutputSchema),
};

export { spec, specBatch, specMigration };
