import {
  conflictError,
  dependencyCycleError,
  invalidTransitionError,
  validationError,
} from "./errors.ts";
import { readOneErrors, route, writeOneErrors } from "./route-helpers.ts";
import {
  dependencyAddInputSchema,
  dependencyEdgeInputSchema,
  dependencyEdgeOutputSchema,
  dependencySchema,
  sprintCreateInputSchema,
  sprintKeyInputSchema,
  sprintListInputSchema,
  sprintSchema,
  sprintUpdateInputSchema,
  ticketCreateInputSchema,
  ticketDetailSchema,
  ticketKeyInputSchema,
  ticketKeyOutputSchema,
  ticketListInputSchema,
  ticketSchema,
  ticketTransitionInputSchema,
  ticketUpdateInputSchema,
} from "./schemas.ts";
import { listOf } from "./schemas-lists.ts";

export const ticket = {
  create: route("POST", "/projects/{projectId}/tickets")
    .errors({ ...writeOneErrors, ...validationError, ...conflictError })
    .input(ticketCreateInputSchema)
    .output(ticketSchema),
  get: route("GET", "/projects/{projectId}/tickets/{key}")
    .errors(readOneErrors)
    .input(ticketKeyInputSchema)
    .output(ticketDetailSchema),
  list: route("GET", "/projects/{projectId}/tickets")
    .errors(readOneErrors)
    .input(ticketListInputSchema)
    .output(listOf(ticketSchema)),
  update: route("PATCH", "/projects/{projectId}/tickets/{key}")
    .errors({ ...writeOneErrors, ...validationError })
    .input(ticketUpdateInputSchema)
    .output(ticketSchema),
  delete: route("DELETE", "/projects/{projectId}/tickets/{key}")
    .errors({ ...writeOneErrors, ...conflictError })
    .input(ticketKeyInputSchema)
    .output(ticketKeyOutputSchema),
  transition: route("POST", "/projects/{projectId}/tickets/{key}/transition")
    .errors({ ...writeOneErrors, ...conflictError, ...invalidTransitionError })
    .input(ticketTransitionInputSchema)
    .output(ticketSchema),
};

export const dependency = {
  add: route("POST", "/projects/{projectId}/tickets/{key}/dependencies")
    .errors({ ...writeOneErrors, ...dependencyCycleError })
    .input(dependencyAddInputSchema)
    .output(dependencySchema),
  remove: route("DELETE", "/projects/{projectId}/tickets/{key}/dependencies/{dependsOn}")
    .errors(writeOneErrors)
    .input(dependencyEdgeInputSchema)
    .output(dependencyEdgeOutputSchema),
  list: route("GET", "/projects/{projectId}/tickets/{key}/dependencies")
    .errors(readOneErrors)
    .input(ticketKeyInputSchema)
    .output(dependencySchema.array()),
};

export const sprint = {
  create: route("POST", "/projects/{projectId}/sprints")
    .errors({ ...writeOneErrors, ...validationError, ...conflictError })
    .input(sprintCreateInputSchema)
    .output(sprintSchema),
  get: route("GET", "/projects/{projectId}/sprints/{key}")
    .errors(readOneErrors)
    .input(sprintKeyInputSchema)
    .output(sprintSchema),
  list: route("GET", "/projects/{projectId}/sprints")
    .errors(readOneErrors)
    .input(sprintListInputSchema)
    .output(sprintSchema.array()),
  update: route("PATCH", "/projects/{projectId}/sprints/{key}")
    .errors({ ...writeOneErrors, ...validationError })
    .input(sprintUpdateInputSchema)
    .output(sprintSchema),
  activate: route("POST", "/projects/{projectId}/sprints/{key}/activate")
    .errors({ ...writeOneErrors, ...conflictError })
    .input(sprintKeyInputSchema)
    .output(sprintSchema),
  close: route("POST", "/projects/{projectId}/sprints/{key}/close")
    .errors({ ...writeOneErrors, ...conflictError })
    .input(sprintKeyInputSchema)
    .output(sprintSchema),
};
