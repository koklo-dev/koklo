import { validationError } from "./errors.ts";
import { readErrors, readOneErrors, route } from "./route-helpers.ts";
import { listOf } from "./schemas-lists.ts";
import {
  activityItemSchema,
  projectActivityInputSchema,
  projectOverviewInputSchema,
  projectOverviewSchema,
} from "./schemas-overview.ts";
import {
  projectRecentOutputSchema,
  projectShellInputSchema,
  projectShellSchema,
  projectVisitInputSchema,
  projectVisitOutputSchema,
  searchInputSchema,
  searchResultSchema,
} from "./schemas-shell.ts";

/**
 * Coquille (TK-88, contrat 2.1.0) : lectures et préférence personnelle ouvertes à tout rôle ayant
 * accès au projet (404 uniforme sinon, jamais 403). Rejoint le groupe `project`.
 */
export const projectShell = {
  shell: route("GET", "/projects/{projectId}/shell")
    .errors(readOneErrors)
    .input(projectShellInputSchema)
    .output(projectShellSchema),
  visit: route("POST", "/projects/{projectId}/visit")
    .errors(readOneErrors)
    .input(projectVisitInputSchema)
    .output(projectVisitOutputSchema),
  recent: route("GET", "/project-visits").errors(readErrors).output(projectRecentOutputSchema),
  /** Vue d'ensemble (TK-92, 2.7.0) : une lecture agrégée, filtrée par audience (B283). */
  overview: route("GET", "/projects/{projectId}/overview")
    .errors(readOneErrors)
    .input(projectOverviewInputSchema)
    .output(projectOverviewSchema),
  /** Activité complète du projet : liste à curseur (50 par page), même projection que l'aperçu. */
  activity: route("GET", "/projects/{projectId}/activity")
    .errors({ ...readOneErrors, ...validationError })
    .input(projectActivityInputSchema)
    .output(listOf(activityItemSchema)),
};

/** Recherche de la palette ⌘K : projets, puis fonctionnalités et tickets du projet courant (B81). */
export const search = {
  query: route("GET", "/search")
    .errors({ ...readOneErrors, ...validationError })
    .input(searchInputSchema)
    .output(listOf(searchResultSchema)),
};
