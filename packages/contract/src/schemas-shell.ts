import { z } from "zod";
import { LIST_QUERY_MAX_LENGTH } from "./schemas-lists.ts";
import { ticketStatusSchema } from "./schemas-tickets.ts";

/**
 * Coquille de l'application (TK-88, contrat 2.1.0, additif). Agrégats sans contenu de spec : tout
 * rôle ayant accès au projet les reçoit (B82). Aucune organisation ni utilisateur en entrée : ils
 * viennent de la session.
 */

/** Étapes d'un projet, dérivées de l'index de la spec et des baselines (DESIGN.md §5.1). */
export const projectPhaseSchema = z.enum(["idea", "framing", "iterations"]);

/** Les sept livrables de la spec, dans l'ordre de rédaction (passation 21 §0, Sécurité en 5e). */
export const DELIVERABLE_KEYS = [
  "functional",
  "data",
  "architecture",
  "technical",
  "security",
  "design",
  "quality",
] as const;
export const deliverableKeySchema = z.enum(DELIVERABLE_KEYS);

/**
 * Un livrable de la barre « SPEC N/7 ». `after` dit ce qui l'ouvre (« le fonctionnel »). Depuis 2.10.0 la
 * disponibilité vient du service des livrables (`spec.deliverables`, TK-100, règle B1) ; le web lit `spec.deliverables`.
 */
export const deliverableAvailabilitySchema = z.object({
  key: deliverableKeySchema,
  available: z.boolean(),
  after: z.string().nullable(),
});

export const projectShellInputSchema = z.object({ projectId: z.uuid() });

export const projectShellSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  phase: projectPhaseSchema,
  deliverables: z.array(deliverableAvailabilitySchema),
  validatedCount: z.number().int().min(0),
  /** Tickets du sprint actif ; `null` sans sprint actif (B84). */
  ticketCount: z.number().int().min(0).nullable(),
});

export const projectVisitInputSchema = projectShellInputSchema;
export const projectVisitOutputSchema = z.object({ visitedAt: z.iso.datetime() });

/** Projets récents de la carte projet : 8 au plus (B80). */
export const RECENT_PROJECTS_MAX = 8;
export const projectRecentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  visitedAt: z.iso.datetime(),
  /** Tuile du projet (TK-93, 2.8.0) : initiales et teinte 1..5, comme sur la carte. */
  initials: z.string(),
  colorKey: z.number().int().min(1).max(5),
});
export const projectRecentOutputSchema = z.array(projectRecentSchema).max(RECENT_PROJECTS_MAX);

/** Résultats de la palette ⌘K : 20 au plus, le total reste le total réel (B81). */
export const SEARCH_RESULTS_MAX = 20;

export const searchInputSchema = z.object({
  q: z.string().min(1).max(LIST_QUERY_MAX_LENGTH),
  projectId: z.uuid().optional(),
});

export const searchResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project"), id: z.uuid(), name: z.string() }),
  z.object({
    kind: z.literal("feature"),
    projectId: z.uuid(),
    specId: z.string(),
    title: z.string(),
  }),
  z.object({
    kind: z.literal("ticket"),
    projectId: z.uuid(),
    key: z.string(),
    title: z.string(),
    status: ticketStatusSchema,
  }),
]);

export type ProjectShellOutput = z.infer<typeof projectShellSchema>;
export type ProjectRecent = z.infer<typeof projectRecentSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
