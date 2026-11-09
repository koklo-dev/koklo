import { z } from "zod";
import { ideaPageStatusSchema } from "./schemas-idea.ts";
import { listInputShape } from "./schemas-lists.ts";
import { deliverableKeySchema } from "./schemas-shell.ts";
import { ticketStatusSchema } from "./schemas-tickets.ts";

/**
 * Vue d'ensemble d'un projet (TK-92, contrat 2.7.0, additif). Une seule lecture agrégée : tous les
 * textes sont construits côté serveur en français, l'écran ne met en forme que les dates relatives.
 * Le contenu est filtré par `audience` (B277, B279) : un client ne reçoit ni SHA ni événement technique.
 */

/** Phase de la vue d'ensemble : la phase transitoire `baseline` n'existe pas avant TK-100 (B272). */
export const overviewPhaseSchema = z.enum(["idea", "framing", "iterations"]);
export const overviewAudienceSchema = z.enum(["team", "client"]);

export const PHASE_STEP_KEYS = ["idea", "framing", "baseline", "iterations"] as const;
export const phaseStepSchema = z.object({
  key: z.enum(PHASE_STEP_KEYS),
  status: z.enum(["done", "current", "todo"]),
  subtitle: z.string(),
});

export const overviewLinkSchema = z.object({ label: z.string(), href: z.string() });

/** Prochaine étape : une seule, la plus prioritaire ; `rule` est une clé stable, jamais affichée. */
export const nextActionSchema = z.object({
  rule: z.string(),
  tone: z.enum(["warning", "neutral"]),
  title: z.string(),
  body: z.string(),
  action: z
    .object({ label: z.string(), href: z.string(), kind: z.enum(["link", "copy_link"]) })
    .optional(),
});

export const overviewStatSchema = z.object({
  key: z.string(),
  icon: z.string(),
  label: z.string(),
  value: z.string(),
  gauge: z.object({ done: z.number().int().min(0), total: z.number().int().min(0) }).optional(),
  note: z.string(),
});

/** Statuts d'un livrable : seul le Fonctionnel en a, avant TK-100 (B273). */
export const overviewDeliverableStatusSchema = z.enum(["todo", "pending", "revise", "validated"]);

export const overviewDeliverableSchema = z.object({
  key: deliverableKeySchema,
  status: overviewDeliverableStatusSchema,
  content: z.string(),
  done: z.number().int().min(0).optional(),
  total: z.number().int().min(0).optional(),
  progressLabel: z.string(),
  validator: z.enum(["client", "team"]),
  validatorLabel: z.string(),
  available: z.boolean(),
  href: z.string().optional(),
});

export const overviewIdeaPageSchema = z.object({
  position: z.number().int().min(0),
  title: z.string(),
  note: z.string(),
  status: ideaPageStatusSchema,
});

export const overviewTicketSchema = z.object({
  key: z.string(),
  title: z.string(),
  note: z.string(),
  status: ticketStatusSchema,
});

export const overviewMainSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("idea"), pages: z.array(overviewIdeaPageSchema) }),
  z.object({ kind: z.literal("deliverables"), items: z.array(overviewDeliverableSchema) }),
  z.object({
    kind: z.literal("sprint"),
    sprint: z.object({ key: z.string(), goal: z.string() }).optional(),
    tickets: z.array(overviewTicketSchema),
  }),
]);

export const activityItemSchema = z.object({
  actor: z.object({
    kind: z.enum(["client", "team", "agent"]),
    name: z.string(),
    initials: z.string(),
  }),
  text: z.string(),
  at: z.iso.datetime(),
});

export const overviewPersonSchema = z.object({
  name: z.string(),
  initials: z.string(),
  role: z.string(),
  kind: z.enum(["client", "team"]),
});

export const projectOverviewInputSchema = z.object({ projectId: z.uuid() });

export const projectOverviewSchema = z.object({
  project: z.object({
    id: z.uuid(),
    name: z.string(),
    startedAt: z.iso.datetime(),
    clientContact: z.string().optional(),
  }),
  audience: overviewAudienceSchema,
  phase: overviewPhaseSchema,
  phaseSteps: z.array(phaseStepSchema),
  primaryAction: overviewLinkSchema.optional(),
  canInvite: z.boolean(),
  nextAction: nextActionSchema.optional(),
  stats: z.array(overviewStatSchema),
  main: overviewMainSchema,
  activity: z.object({ items: z.array(activityItemSchema), total: z.number().int().min(0) }),
  people: z.object({
    items: z.array(overviewPersonSchema),
    others: z.number().int().min(0),
  }),
});

/** Liste complète de l'activité : mêmes filtres que l'aperçu, curseur et pages de 50 (liste 1.1). */
export const projectActivityInputSchema = z.object({
  projectId: z.uuid(),
  ...(({ cursor, limit }) => ({ cursor, limit }))(listInputShape(z.string())),
});

export type ProjectOverview = z.infer<typeof projectOverviewSchema>;
export type OverviewNextAction = z.infer<typeof nextActionSchema>;
export type OverviewStat = z.infer<typeof overviewStatSchema>;
export type ActivityItem = z.infer<typeof activityItemSchema>;
