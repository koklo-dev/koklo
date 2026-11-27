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
  adrByIdInputSchema,
  adrDetailSchema,
  adrListInputSchema,
  adrSummarySchema,
  archflowDetailSchema,
  architectureChecksInputSchema,
  architectureChecksSchema,
  architectureComponentSummarySchema,
  architectureComponentsListInputSchema,
  architectureDocumentInputSchema,
  architectureDocumentSchema,
  architectureFlowSummarySchema,
  architectureFlowsByIdInputSchema,
  architectureFlowsListInputSchema,
  architectureLayoutGetInputSchema,
  architectureLayoutSavedSchema,
  architectureLayoutSaveInputSchema,
  architectureLayoutSchema,
  architectureSearchInputSchema,
  architectureSearchSchema,
  architectureSourceInputSchema,
  architectureSourceSchema,
  architectureZoneInputSchema,
  architectureZoneSchema,
  architectureZonesInputSchema,
  architectureZonesSchema,
} from "./schemas-spec-architecture.ts";
import {
  dataFixturePageInputSchema,
  dataFixturePageSchema,
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
  dataSearchInputSchema,
  dataSearchSchema,
  dataTableSourceInputSchema,
  dataTableSourceSchema,
  dataTableSummarySchema,
  dataTablesListInputSchema,
  dataZoneInputSchema,
  dataZoneSchema,
  dataZonesInputSchema,
  dataZonesSchema,
} from "./schemas-spec-data.ts";
import {
  functionalItemSchema,
  functionalListInputSchema,
  rolesMatrixInputSchema,
  rolesMatrixSchema,
} from "./schemas-spec-domain.ts";
import {
  documentSectionsInputSchema,
  stackChooseInputSchema,
  stackListInputSchema,
  stackSourceInputSchema,
  stackSummarySchema,
  technicalEnvironmentsInputSchema,
  technicalEnvironmentsSchema,
} from "./schemas-spec-technical.ts";
import {
  nfrListInputSchema,
  nfrSummarySchema,
  operationByIdInputSchema,
  operationDetailSchema,
  operationListInputSchema,
  operationOptionsInputSchema,
  operationOptionsSchema,
  operationSummarySchema,
  technicalContractSchema,
} from "./schemas-spec-technical-api.ts";

/** Lecture depuis l'index en base (CDC §8.2) : ouverte à tous les rôles, 404 hors projet. */
const readIndexErrors = { ...readOneErrors, ...validationError } as const;

/** Lecture de l'équipe et du designer sur le cahier technique (403 client et business), depuis l'index seul. */
const technicalRead = (path: `/${string}`) =>
  route("GET", `/projects/{projectId}/spec/technical${path}`).errors({
    ...writeOneErrors,
    ...validationError,
    ...specIndexFailedError,
  });

/**
 * Onglets API et Exigences (TK-116, 3.18.0, B770 à B774) : opérations `zone.verbe` (pages de 50, `q`, `zone`, `around`),
 * fiche, YAML, listes de la feuille, contrat généré et exigences.
 */
const technicalApi = {
  ops: {
    list: technicalRead("/operations")
      .input(operationListInputSchema)
      .output(listOf(operationSummarySchema)),
    byId: technicalRead("/operations/{opId}")
      .input(operationByIdInputSchema)
      .output(operationDetailSchema),
    /** `api/endpoints/<zone.verbe>.yaml` au commit lu, sinon YAML généré depuis l'index. */
    source: route("GET", "/projects/{projectId}/spec/technical/operations/{opId}/source")
      .errors({
        ...writeOneErrors,
        ...validationError,
        ...specIndexFailedError,
        ...providerErrors,
      })
      .input(operationByIdInputSchema)
      .output(architectureSourceSchema),
    options: technicalRead("/operation-options")
      .input(operationOptionsInputSchema)
      .output(operationOptionsSchema),
  },
  contract: technicalRead("/operations/{opId}/contract")
    .input(operationByIdInputSchema)
    .output(technicalContractSchema),
  nfr: {
    list: technicalRead("/nfr").input(nfrListInputSchema).output(listOf(nfrSummarySchema)),
  },
};

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
    /** Volume réel (TK-110, 3.8.0, B482, B483) : zones, une zone ouverte, recherche d'une table. Équipe et designer. */
    zones: route("GET", "/projects/{projectId}/spec/data/zones")
      .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
      .input(dataZonesInputSchema)
      .output(dataZonesSchema),
    zone: route("GET", "/projects/{projectId}/spec/data/zone")
      .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
      .input(dataZoneInputSchema)
      .output(dataZoneSchema),
    search: route("GET", "/projects/{projectId}/spec/data/search")
      .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
      .input(dataSearchInputSchema)
      .output(dataSearchSchema),
    mermaid: route("GET", "/projects/{projectId}/spec/data/mermaid")
      .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
      .input(dataMermaidInputSchema)
      .output(dataMermaidSchema),
    fixtures: {
      list: route("GET", "/projects/{projectId}/spec/data/fixtures")
        .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
        .input(dataFixturesListInputSchema)
        .output(dataFixturesListSchema),
      /** Page de 25 lignes ; déprécié en 3.8.0 au profit de `page` (25, 50 ou 100). */
      rows: route("GET", "/projects/{projectId}/spec/data/fixtures/{fixtureId}/rows")
        .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
        .input(dataFixtureRowsInputSchema)
        .output(dataFixtureRowsSchema),
      /** Page de 25, 50 ou 100 lignes, stockées puis générées (TK-110, 3.8.0, B485). */
      page: route("GET", "/projects/{projectId}/spec/data/fixtures/{fixtureId}/page")
        .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
        .input(dataFixturePageInputSchema)
        .output(dataFixturePageSchema),
    },
  },
  /**
   * Page Architecture (TK-111, 3.9.0, B506 à B515) : composants (liste à curseur, `q` sur toute la tête, `zone`, `around`),
   * document (sections lues en Git, jamais indexées) et avertissements. Équipe et designer en lecture (403 client et
   * business : aucun YAML ni Mermaid ne sort). Erreurs de `spec.listFeatures`.
   */
  architecture: {
    components: {
      list: route("GET", "/projects/{projectId}/spec/architecture/components")
        .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
        .input(architectureComponentsListInputSchema)
        .output(listOf(architectureComponentSummarySchema)),
    },
    document: route("GET", "/projects/{projectId}/spec/architecture/document")
      .errors({
        ...writeOneErrors,
        ...validationError,
        ...specIndexFailedError,
        ...providerErrors,
      })
      .input(architectureDocumentInputSchema)
      .output(architectureDocumentSchema),
    /** Avertissements non bloquants (`200` même s'il y en a) : index de tête plus propositions en attente du lancement ouvert. */
    checks: route("GET", "/projects/{projectId}/spec/architecture/checks")
      .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
      .input(architectureChecksInputSchema)
      .output(architectureChecksSchema),
    /**
     * Schéma en couches et flux en séquence (TK-112, 3.10.0, B541 à B550). Lectures de l'équipe et du designer (403 client et
     * business : aucun YAML ni Mermaid hors équipe) ; `layout.save` pour owner, admin et développeur (403 designer, client,
     * business), un lot `architecture.layout.save`, dernier écrit gagne. Erreurs de `spec.architecture.components.list`.
     */
    zones: route("GET", "/projects/{projectId}/spec/architecture/zones")
      .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
      .input(architectureZonesInputSchema)
      .output(architectureZonesSchema),
    zone: route("GET", "/projects/{projectId}/spec/architecture/zone")
      .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
      .input(architectureZoneInputSchema)
      .output(architectureZoneSchema),
    search: route("GET", "/projects/{projectId}/spec/architecture/search")
      .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
      .input(architectureSearchInputSchema)
      .output(architectureSearchSchema),
    layout: {
      get: route("GET", "/projects/{projectId}/spec/architecture/layout")
        .errors({
          ...writeOneErrors,
          ...validationError,
          ...specIndexFailedError,
          ...providerErrors,
        })
        .input(architectureLayoutGetInputSchema)
        .output(architectureLayoutSchema),
      save: route("POST", "/projects/{projectId}/spec/architecture/layout")
        .errors({
          ...writeOneErrors,
          ...validationError,
          ...providerErrors,
          ...specBatchConflictError,
          ...specInvalidError,
        })
        .input(architectureLayoutSaveInputSchema)
        .output(architectureLayoutSavedSchema),
    },
    flows: {
      list: route("GET", "/projects/{projectId}/spec/architecture/flows")
        .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
        .input(architectureFlowsListInputSchema)
        .output(listOf(architectureFlowSummarySchema)),
      byId: route("GET", "/projects/{projectId}/spec/architecture/flows/{flowId}")
        .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
        .input(architectureFlowsByIdInputSchema)
        .output(archflowDetailSchema),
    },
    /**
     * Décisions (TK-113, 3.11.0, B575 à B592) : liste à pages de 50 (`q`, `status`, `component`, `from`, `to`, `around`, facettes
     * `status`) et fiche. Équipe et designer en lecture (403 client et business : ils lisent `clientSpace.architecture*`).
     */
    adr: {
      list: route("GET", "/projects/{projectId}/spec/architecture/adr")
        .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
        .input(adrListInputSchema)
        .output(listOf(adrSummarySchema)),
      byId: route("GET", "/projects/{projectId}/spec/architecture/adr/{adrId}")
        .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
        .input(adrByIdInputSchema)
        .output(adrDetailSchema),
    },
    /** YAML d'un composant, YAML ou Mermaid d'un flux, Mermaid du schéma : équipe et designer seulement. */
    source: route("GET", "/projects/{projectId}/spec/architecture/source")
      .errors({
        ...writeOneErrors,
        ...validationError,
        ...specIndexFailedError,
        ...providerErrors,
      })
      .input(architectureSourceInputSchema)
      .output(architectureSourceSchema),
  },
  /**
   * Page Technique (TK-115, 3.17.0, B725, B728) : choix de la stack (pages de 24, `q`, `around`, facettes `layer` et
   * `status`), YAML d'un choix, environnements, et « Choisir » (un lot d'une `stack.update` ; owner, admin, développeur).
   * Lectures de l'équipe et du designer (403 client et business : ils lisent `clientSpace.technical*`).
   */
  technical: {
    stack: {
      list: route("GET", "/projects/{projectId}/spec/technical/stack")
        .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
        .input(stackListInputSchema)
        .output(listOf(stackSummarySchema)),
      choose: route("POST", "/projects/{projectId}/spec/technical/stack/{id}/choose")
        .errors({
          ...writeOneErrors,
          ...validationError,
          ...providerErrors,
          ...specIndexFailedError,
          ...specBatchConflictError,
          ...specInvalidError,
        })
        .input(stackChooseInputSchema)
        .output(specBatchSchema),
      /** `tech/stack/<slug>.yaml` au commit lu, sinon YAML généré depuis l'index. */
      source: route("GET", "/projects/{projectId}/spec/technical/stack/{id}/source")
        .errors({
          ...writeOneErrors,
          ...validationError,
          ...specIndexFailedError,
          ...providerErrors,
        })
        .input(stackSourceInputSchema)
        .output(architectureSourceSchema),
    },
    environments: route("GET", "/projects/{projectId}/spec/technical/environments")
      .errors({ ...writeOneErrors, ...validationError, ...specIndexFailedError })
      .input(technicalEnvironmentsInputSchema)
      .output(technicalEnvironmentsSchema),
    ...technicalApi,
  },
  /** Sections d'un document (`architecture` ou `technical`), lues en Git au commit indexé, jamais indexées (3.17.0). */
  document: {
    sections: route("GET", "/projects/{projectId}/spec/document/sections")
      .errors({
        ...writeOneErrors,
        ...validationError,
        ...specIndexFailedError,
        ...providerErrors,
      })
      .input(documentSectionsInputSchema)
      .output(architectureDocumentSchema),
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
