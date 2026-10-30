import {
  conflictError,
  dependencyCycleError,
  invalidTransitionError,
  validationError,
} from "./errors.ts";
import { readErrors, readOneErrors, route, writeErrors, writeOneErrors } from "./route-helpers.ts";
import {
  dependencyAddInputSchema,
  dependencyEdgeInputSchema,
  dependencySchema,
  pageOf,
  sprintCreateInputSchema,
  sprintKeyInputSchema,
  sprintListInputSchema,
  sprintSchema,
  sprintUpdateInputSchema,
  ticketCreateInputSchema,
  ticketDetailSchema,
  ticketKeyInputSchema,
  ticketListInputSchema,
  ticketSchema,
  ticketTransitionInputSchema,
  ticketUpdateInputSchema,
} from "./schemas.ts";

export const ticket = {
  create: route("POST", "/tickets")
    .errors({ ...writeErrors, ...validationError, ...conflictError })
    .input(ticketCreateInputSchema)
    .output(ticketSchema),
  get: route("GET", "/tickets/{key}")
    .errors(readOneErrors)
    .input(ticketKeyInputSchema)
    .output(ticketDetailSchema),
  list: route("GET", "/tickets")
    .errors(readErrors)
    .input(ticketListInputSchema)
    .output(pageOf(ticketSchema)),
  update: route("PATCH", "/tickets/{key}")
    .errors({ ...writeOneErrors, ...validationError })
    .input(ticketUpdateInputSchema)
    .output(ticketSchema),
  delete: route("DELETE", "/tickets/{key}")
    .errors({ ...writeOneErrors, ...conflictError })
    .input(ticketKeyInputSchema)
    .output(ticketKeyInputSchema),
  transition: route("POST", "/tickets/{key}/transition")
    .errors({ ...writeOneErrors, ...conflictError, ...invalidTransitionError })
    .input(ticketTransitionInputSchema)
    .output(ticketSchema),
};

export const dependency = {
  add: route("POST", "/tickets/{key}/dependencies")
    .errors({ ...writeOneErrors, ...dependencyCycleError })
    .input(dependencyAddInputSchema)
    .output(dependencySchema),
  remove: route("DELETE", "/tickets/{key}/dependencies/{dependsOn}")
    .errors(writeOneErrors)
    .input(dependencyEdgeInputSchema)
    .output(dependencyEdgeInputSchema),
  list: route("GET", "/tickets/{key}/dependencies")
    .errors(readOneErrors)
    .input(ticketKeyInputSchema)
    .output(dependencySchema.array()),
};

export const sprint = {
  create: route("POST", "/sprints")
    .errors({ ...writeErrors, ...validationError, ...conflictError })
    .input(sprintCreateInputSchema)
    .output(sprintSchema),
  get: route("GET", "/sprints/{key}")
    .errors(readOneErrors)
    .input(sprintKeyInputSchema)
    .output(sprintSchema),
  list: route("GET", "/sprints")
    .errors(readErrors)
    .input(sprintListInputSchema)
    .output(sprintSchema.array()),
  update: route("PATCH", "/sprints/{key}")
    .errors({ ...writeOneErrors, ...validationError })
    .input(sprintUpdateInputSchema)
    .output(sprintSchema),
  activate: route("POST", "/sprints/{key}/activate")
    .errors({ ...writeOneErrors, ...conflictError })
    .input(sprintKeyInputSchema)
    .output(sprintSchema),
  close: route("POST", "/sprints/{key}/close")
    .errors({ ...writeOneErrors, ...conflictError })
    .input(sprintKeyInputSchema)
    .output(sprintSchema),
};
