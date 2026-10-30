import { z } from "zod";

/** Valeurs littérales identiques à celles du domaine (parité vérifiée par apps/api/test). */
export const ticketStatusSchema = z.enum([
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
  "cancelled",
]);
export const ticketTypeSchema = z.enum(["feature", "bug", "task", "chore"]);
export const ticketPrioritySchema = z.enum(["low", "medium", "high", "critical"]);
export const ticketPackageSchema = z.enum([
  "web",
  "api",
  "worker",
  "contract",
  "db",
  "domain",
  "schema",
  "github",
  "rules",
  "delivery",
  "cli",
  "ui",
  "config",
  "e2e",
  "infra",
]);
export const sensitivitySchema = z.enum(["safe", "sensitive"]);
export const dependencyTypeSchema = z.enum(["blocks", "related"]);
export const holderKindSchema = z.enum(["member", "runner"]);
export const sprintStatusSchema = z.enum(["planned", "active", "closed"]);

/** Un ticket naît en backlog ou en todo ; les autres statuts passent par `ticket.transition`. */
export const initialStatusSchema = ticketStatusSchema.extract(["backlog", "todo"]);

export const ticketKeySchema = z.string().regex(/^TK-[1-9][0-9]*$/);
export const sprintKeySchema = z.string().regex(/^SP-[1-9][0-9]*$/);
/** Instant ISO-8601 en UTC. */
export const instantSchema = z.iso.datetime();

/** Pagination par curseur : `limit` arrive en chaîne dans une requête GET, d'où la coercition. */
export const pageInputSchema = {
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).optional(),
};
export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const holderSchema = z.object({ kind: holderKindSchema, id: z.string().min(1) });

const titleSchema = z.string().min(1).max(200);
const estimateSchema = z.number().min(0);

export const ticketSchema = z.object({
  id: z.uuid(),
  key: ticketKeySchema,
  title: z.string(),
  description: z.string(),
  type: ticketTypeSchema,
  status: ticketStatusSchema,
  priority: ticketPrioritySchema,
  sprint: sprintKeySchema.nullable(),
  assignee: z.string().nullable(),
  pkg: ticketPackageSchema,
  labels: z.array(z.string()),
  sensitivity: sensitivitySchema,
  estimateHours: estimateSchema.nullable(),
  linkedFeatures: z.array(z.string()),
  branch: z.string().nullable(),
  pullRequest: z.string().nullable(),
  attempts: z.number().int().min(0),
  reviewRounds: z.number().int().min(0),
  createdAt: instantSchema,
});

export const dependencySchema = z.object({
  ticket: ticketKeySchema,
  dependsOn: ticketKeySchema,
  type: dependencyTypeSchema,
});

export const leaseSchema = z.object({
  ticket: ticketKeySchema,
  holder: holderSchema,
  branch: z.string(),
  worktree: z.string(),
  acquiredAt: instantSchema,
  heartbeatAt: instantSchema,
  expiresAt: instantSchema,
  ttlMs: z.number().int().positive(),
  released: z.boolean(),
});

export const ticketDetailSchema = ticketSchema.extend({
  criteria: z.array(z.object({ statement: z.string(), specRef: z.string().nullable() })),
  dependencies: z.array(dependencySchema),
  lease: leaseSchema.nullable(),
});

export const ticketCreateInputSchema = z.object({
  title: titleSchema,
  description: z.string().optional(),
  type: ticketTypeSchema,
  priority: ticketPrioritySchema,
  pkg: ticketPackageSchema,
  sensitivity: sensitivitySchema,
  status: initialStatusSchema.optional(),
  sprintId: sprintKeySchema.optional(),
  assignee: holderSchema.optional(),
  labels: z.array(z.string()).optional(),
  estimateHours: estimateSchema.optional(),
  linkedFeatures: z.array(z.string()).optional(),
  criteria: z
    .array(z.object({ statement: z.string().min(1), specRef: z.string().min(1).optional() }))
    .optional(),
});

export const ticketKeyInputSchema = z.object({ key: ticketKeySchema });

export const ticketListInputSchema = z.object({
  status: ticketStatusSchema.optional(),
  sprintId: sprintKeySchema.optional(),
  pkg: ticketPackageSchema.optional(),
  assignee: z.string().min(1).optional(),
  ...pageInputSchema,
});

/** Strict : le statut ne se modifie que par `ticket.transition`. */
export const ticketUpdateInputSchema = z.strictObject({
  key: ticketKeySchema,
  title: titleSchema.optional(),
  description: z.string().optional(),
  priority: ticketPrioritySchema.optional(),
  pkg: ticketPackageSchema.optional(),
  sensitivity: sensitivitySchema.optional(),
  sprintId: sprintKeySchema.optional(),
  assignee: holderSchema.optional(),
  labels: z.array(z.string()).optional(),
  estimateHours: estimateSchema.optional(),
  linkedFeatures: z.array(z.string()).optional(),
});

export const ticketTransitionInputSchema = z.object({
  key: ticketKeySchema,
  to: ticketStatusSchema,
});

export const dependencyEdgeInputSchema = z.object({
  key: ticketKeySchema,
  dependsOn: ticketKeySchema,
  type: dependencyTypeSchema,
});
export const dependencyAddInputSchema = dependencyEdgeInputSchema.refine(
  (edge) => edge.key !== edge.dependsOn,
  { message: "un ticket ne peut pas dépendre de lui-même", path: ["dependsOn"] },
);

const dateSchema = z.iso.date();
const endsAfterStart = (sprint: { startsOn?: string; endsOn?: string }) =>
  sprint.startsOn === undefined || sprint.endsOn === undefined || sprint.endsOn >= sprint.startsOn;
const endsAfterStartIssue = { message: "endsOn doit suivre startsOn", path: ["endsOn"] };

export const sprintSchema = z.object({
  id: z.uuid(),
  key: sprintKeySchema,
  goal: z.string(),
  status: sprintStatusSchema,
  startsOn: dateSchema,
  endsOn: dateSchema,
  definitionOfDone: z.string(),
});

export const sprintCreateInputSchema = z
  .object({
    goal: z.string().min(1),
    startsOn: dateSchema,
    endsOn: dateSchema,
    definitionOfDone: z.string().optional(),
  })
  .refine(endsAfterStart, endsAfterStartIssue);

export const sprintKeyInputSchema = z.object({ key: sprintKeySchema });
export const sprintListInputSchema = z.object({ status: sprintStatusSchema.optional() });

/** Strict : le statut passe par `activate` et `close`. */
export const sprintUpdateInputSchema = z
  .strictObject({
    key: sprintKeySchema,
    goal: z.string().min(1).optional(),
    startsOn: dateSchema.optional(),
    endsOn: dateSchema.optional(),
    definitionOfDone: z.string().optional(),
  })
  .refine(endsAfterStart, endsAfterStartIssue);
