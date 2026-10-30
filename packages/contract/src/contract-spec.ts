import {
  providerErrors,
  specBatchConflictError,
  specInvalidError,
  validationError,
} from "./errors.ts";
import { readOneErrors, route, writeOneErrors } from "./route-helpers.ts";
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
} from "./schemas-spec.ts";
import { pageOf } from "./schemas-tickets.ts";

/** Lecture depuis l'index en base (CDC §8.2) : ouverte à tous les rôles, 404 hors projet. */
const readIndexErrors = { ...readOneErrors, ...validationError } as const;

const spec = {
  head: route("GET", "/projects/{projectId}/spec")
    .errors(readIndexErrors)
    .input(specHeadInputSchema)
    .output(specHeadSchema),
  listFeatures: route("GET", "/projects/{projectId}/spec/features")
    .errors(readIndexErrors)
    .input(featureListInputSchema)
    .output(pageOf(featureSummarySchema)),
  getFeature: route("GET", "/projects/{projectId}/spec/features/{specId}")
    .errors({ ...readOneErrors, ...providerErrors })
    .input(featureGetInputSchema)
    .output(featureDetailSchema),
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

export { spec, specBatch };
