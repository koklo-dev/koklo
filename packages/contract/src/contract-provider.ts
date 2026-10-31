import {
  conflictError,
  providerErrors,
  providerUnavailableError,
  repoCreationForbiddenError,
  userTokenRequiredError,
  validationError,
} from "./errors.ts";
import { route, writeErrors, writeOneErrors } from "./route-helpers.ts";
import {
  installationListOutputSchema,
  installationStartInputSchema,
  installationStartOutputSchema,
  repoCreateSpecInputSchema,
  repoLinkInputSchema,
  repoListInputSchema,
  repoListOutputSchema,
  repoSchema,
} from "./schemas-provider.ts";

/** `start` : 503 sans identifiants client/clé de chiffrement ; 422 au-delà de 20 états en attente. */
const startErrors = { ...writeOneErrors, ...validationError, ...providerUnavailableError } as const;

/** Le callback GitHub est une redirection navigateur : il n'est ni une procédure ni dans l'OpenAPI. */
const installation = {
  list: route("GET", "/provider/installations")
    .errors(writeErrors)
    .output(installationListOutputSchema),
  start: route("POST", "/provider/installations/start")
    .errors(startErrors)
    .input(installationStartInputSchema)
    .output(installationStartOutputSchema),
};

const linkErrors = {
  ...writeOneErrors,
  ...conflictError,
  ...validationError,
  ...providerErrors,
} as const;

const repo = {
  list: route("GET", "/projects/{projectId}/repos")
    .errors(writeOneErrors)
    .input(repoListInputSchema)
    .output(repoListOutputSchema),
  link: route("POST", "/projects/{projectId}/repos")
    .errors(linkErrors)
    .input(repoLinkInputSchema)
    .output(repoSchema),
  createSpec: route("POST", "/projects/{projectId}/spec-repo")
    .errors({ ...linkErrors, ...repoCreationForbiddenError, ...userTokenRequiredError })
    .input(repoCreateSpecInputSchema)
    .output(repoSchema),
};

export { installation, repo };
