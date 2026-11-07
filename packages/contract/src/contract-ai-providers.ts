import { llmCallErrors } from "./contract-ai.ts";
import { conflictOf, notFoundError, validationError } from "./errors.ts";
import { route, writeErrors } from "./route-helpers.ts";
import {
  aiModelListOutputSchema,
  aiProviderAddInputSchema,
  aiProviderItemSchema,
  aiProviderListOutputSchema,
  aiProviderPathInputSchema,
  aiProviderRemoveOutputSchema,
  aiProviderReplaceKeyInputSchema,
  aiProviderVerifyOutputSchema,
  aiSettingsGetOutputSchema,
  aiSettingsUpdateInputSchema,
  aiUsageReportInputSchema,
  aiUsageReportOutputSchema,
  aiUsageSetInputSchema,
  aiUsageSetOutputSchema,
} from "./schemas-ai-providers.ts";

const PROVIDER = "/ai/providers/{provider}";
const readErrors = { ...writeErrors } as const;
const oneErrors = { ...writeErrors, ...notFoundError, ...validationError } as const;
const keyErrors = { ...llmCallErrors, ...notFoundError } as const;

/**
 * Fournisseurs d'IA de l'organisation (2.3.0, TK-98 ; owner et admin, lectures comprises). Une clé n'est
 * enregistrée qu'après un test réussi ; elle n'est jamais renvoyée. Remplace `llmCredential.*` pour l'écran.
 */
export const aiProvider = {
  list: route("GET", "/ai/providers").errors(readErrors).output(aiProviderListOutputSchema),
  add: route("POST", "/ai/providers")
    .errors({ ...llmCallErrors, ...conflictOf("already_configured") })
    .input(aiProviderAddInputSchema)
    .output(aiProviderItemSchema),
  verify: route("POST", `${PROVIDER}/verify`)
    .errors(keyErrors)
    .input(aiProviderPathInputSchema)
    .output(aiProviderVerifyOutputSchema),
  replaceKey: route("PUT", `${PROVIDER}/key`)
    .errors(keyErrors)
    .input(aiProviderReplaceKeyInputSchema)
    .output(aiProviderItemSchema),
  remove: route("DELETE", PROVIDER)
    .errors(oneErrors)
    .input(aiProviderPathInputSchema)
    .output(aiProviderRemoveOutputSchema),
  setPrimary: route("POST", `${PROVIDER}/primary`)
    .errors(oneErrors)
    .input(aiProviderPathInputSchema)
    .output(aiProviderItemSchema),
};

/** Modèles qualifiés du catalogue (lecture seule). */
export const aiModel = {
  listQualified: route("GET", "/ai/models").errors(readErrors).output(aiModelListOutputSchema),
};

/** Modèle par usage et consommation du mois (micro-dollars ; la conversion est l'affaire de l'écran). */
export const aiUsage = {
  set: route("PUT", "/ai/usages/{usage}")
    .errors({ ...writeErrors, ...validationError })
    .input(aiUsageSetInputSchema)
    .output(aiUsageSetOutputSchema),
  report: route("GET", "/ai/usage")
    .errors({ ...writeErrors, ...validationError })
    .input(aiUsageReportInputSchema)
    .output(aiUsageReportOutputSchema),
};

/** Secours, interrupteur et plafond mensuel. */
export const aiSettings = {
  get: route("GET", "/ai/settings").errors(readErrors).output(aiSettingsGetOutputSchema),
  update: route("PATCH", "/ai/settings")
    .errors({ ...writeErrors, ...validationError })
    .input(aiSettingsUpdateInputSchema)
    .output(aiSettingsGetOutputSchema),
};
