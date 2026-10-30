import {
  leaseExpiredError,
  leaseHeldError,
  leaseNotHolderError,
  versionConflictError,
} from "./errors.ts";
import { readErrors, readOneErrors, route, writeErrors, writeOneErrors } from "./route-helpers.ts";
import {
  auditEntrySchema,
  auditListInputSchema,
  commentCreateInputSchema,
  commentIdInputSchema,
  commentListInputSchema,
  commentSchema,
  leaseAcquireInputSchema,
  leaseSchema,
  pageOf,
  projectStateSchema,
  projectStateUpdateInputSchema,
  ticketKeyInputSchema,
} from "./schemas.ts";

const comment = {
  create: route("POST", "/comments")
    .errors(writeErrors)
    .input(commentCreateInputSchema)
    .output(commentSchema),
  list: route("GET", "/comments")
    .errors(readErrors)
    .input(commentListInputSchema)
    .output(pageOf(commentSchema)),
  delete: route("DELETE", "/comments/{id}")
    .errors(writeOneErrors)
    .input(commentIdInputSchema)
    .output(commentIdInputSchema),
};

const projectState = {
  get: route("GET", "/project-state").errors(readErrors).output(projectStateSchema),
  update: route("PUT", "/project-state")
    .errors({ ...writeErrors, ...versionConflictError })
    .input(projectStateUpdateInputSchema)
    .output(projectStateSchema),
};

/** Heartbeat et release : le titulaire est vérifié sur le jeton, pas par un rôle (LEASE_NOT_HOLDER). */
const holderErrors = { ...readOneErrors, ...leaseNotHolderError } as const;

const lease = {
  acquire: route("POST", "/tickets/{key}/lease")
    .errors({ ...writeOneErrors, ...leaseHeldError })
    .input(leaseAcquireInputSchema)
    .output(leaseSchema),
  heartbeat: route("POST", "/tickets/{key}/lease/heartbeat")
    .errors({ ...holderErrors, ...leaseExpiredError })
    .input(ticketKeyInputSchema)
    .output(leaseSchema),
  release: route("DELETE", "/tickets/{key}/lease")
    .errors(holderErrors)
    .input(ticketKeyInputSchema)
    .output(leaseSchema),
  get: route("GET", "/tickets/{key}/lease")
    .errors(readOneErrors)
    .input(ticketKeyInputSchema)
    .output(leaseSchema.nullable()),
};

/** Lecture seule : le journal est immuable et alimenté par le serveur (CDC §4.2). */
const audit = {
  list: route("GET", "/audit")
    .errors(writeErrors)
    .input(auditListInputSchema)
    .output(pageOf(auditEntrySchema)),
};

export { audit, comment, lease, projectState };
