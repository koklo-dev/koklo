import { z } from "zod";
import { proposalErrors } from "./contract-ai.ts";
import { submitErrors } from "./contract-review.ts";
import {
  proposalInProgressError,
  providerErrors,
  specBatchConflictError,
  specIndexFailedError,
  specInvalidError,
  validationError,
} from "./errors.ts";
import { route, writeOneErrors } from "./route-helpers.ts";
import { facetsSchema, listOf } from "./schemas-lists.ts";
import {
  aiProposeDeliverableOutputSchema,
  securitySummaryProposeInputSchema,
} from "./schemas-proposals.ts";
import { reviewSubmitOutputSchema, securityValidateInputSchema } from "./schemas-review.ts";
import {
  asvsReportSchema,
  asvsSetLevelInputSchema,
  dataClassifyInputSchema,
  dataListInputSchema,
  dataRowSchema,
  registryExportSchema,
  rightsMatrixSchema,
  securityContextSchema,
  securityRevisionInputSchema,
  summaryAcceptInputSchema,
  summaryReadSchema,
  threatByIdInputSchema,
  threatCreateInputSchema,
  threatDetailSchema,
  threatListInputSchema,
  threatSummarySchema,
  threatUpdateInputSchema,
} from "./schemas-security.ts";
import { specBatchSchema } from "./schemas-spec.ts";

const BASE = "/projects/{projectId}/spec/security" as const;

/** Lecture de l'équipe et du designer, depuis l'index (403 client et business). */
const read = (path: `/${string}`) =>
  route("GET", `${BASE}${path}`).errors({
    ...writeOneErrors,
    ...validationError,
    ...specIndexFailedError,
  });

/** Écriture par un lot d'une opération (B807) : owner, admin et développeur (designer 403). */
const write = (path: `/${string}`) =>
  route("POST", `${BASE}${path}`).errors({
    ...writeOneErrors,
    ...validationError,
    ...providerErrors,
    ...specIndexFailedError,
    ...specBatchConflictError,
    ...specInvalidError,
  });

const threatPageSchema = listOf(threatSummarySchema).extend({
  /** Comptes de toute la tête (`status`) et par première surface. */
  facets: facetsSchema,
  surfaces: z.array(z.object({ id: z.string(), title: z.string() })),
});
const dataPageSchema = listOf(dataRowSchema).extend({ context: securityContextSchema });

/**
 * Livrable Sécurité (TK-117, contrat 3.19.0) : lectures par owner, admin, développeur et designer ; écritures, propositions
 * et validation par owner, admin et développeur ; client et business 403 partout (ils lisent `clientSpace.security`).
 */
export const security = {
  threat: {
    list: read("/threats").input(threatListInputSchema).output(threatPageSchema),
    byId: read("/threats/{threatId}").input(threatByIdInputSchema).output(threatDetailSchema),
    create: write("/threats").input(threatCreateInputSchema).output(specBatchSchema),
    update: write("/threats/{threatId}").input(threatUpdateInputSchema).output(specBatchSchema),
  },
  data: {
    list: read("/data").input(dataListInputSchema).output(dataPageSchema),
    classify: write("/data").input(dataClassifyInputSchema).output(specBatchSchema),
  },
  registry: {
    export: read("/data/registry").input(securityRevisionInputSchema).output(registryExportSchema),
  },
  rights: {
    get: read("/rights").input(securityRevisionInputSchema).output(rightsMatrixSchema),
  },
  asvs: {
    report: read("/asvs").input(securityRevisionInputSchema).output(asvsReportSchema),
    setLevel: write("/asvs/level").input(asvsSetLevelInputSchema).output(specBatchSchema),
  },
  summary: {
    get: read("/summary").input(securityRevisionInputSchema).output(summaryReadSchema),
    /** Raccourci du circuit commun (`ai.proposeDeliverable`, mode `summary`) : mêmes refus, même lancement. */
    propose: route("POST", `${BASE}/summary/proposals`)
      .errors({ ...proposalErrors, ...proposalInProgressError })
      .input(securitySummaryProposeInputSchema)
      .output(aiProposeDeliverableOutputSchema),
    accept: write("/summary/accept").input(summaryAcceptInputSchema).output(specBatchSchema),
  },
  /** Passe par `review.submit` : mêmes refus, dont 409 `threats_open` puis `data_unclassified` (B804). */
  validate: route("POST", `${BASE}/validate`)
    .errors(submitErrors)
    .input(securityValidateInputSchema)
    .output(reviewSubmitOutputSchema),
};
