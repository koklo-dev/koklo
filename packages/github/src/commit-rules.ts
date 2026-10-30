import { GitConflictError } from "@koklo/domain";

/** Plafond de `listCommits` : une seule page, jamais de page suivante (adaptateur ET faux). */
export const MAX_COMMITS = 50;

/** `limit` demandé -> nombre de commits servis : défaut et plafond `MAX_COMMITS`, jamais moins de 1. */
export const commitLimit = (requested: number | undefined): number =>
  Math.max(1, Math.min(Math.trunc(requested ?? MAX_COMMITS), MAX_COMMITS));

/** Tri de `listFiles` : ordre des unités de code UTF-16 sur `path`, identique des deux côtés. */
export const byPath = (a: { readonly path: string }, b: { readonly path: string }): number =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

/** Refus d'une écriture dont la tête de branche n'est plus celle attendue (rien n'a été écrit). */
export const staleHead = (identifier: string): GitConflictError =>
  new GitConflictError({ operation: "writeCommit", reason: "stale-sha", identifier });
