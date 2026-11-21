import type { GitSource } from "../spec-data/spec-data.repository.ts";
import type { Revision } from "../spec-read/spec-read.repository.ts";
import type { ProjectScope } from "../tracker/scope.ts";

export const SPEC_ARCHITECTURE_REPOSITORY = Symbol("SPEC_ARCHITECTURE_REPOSITORY");

export type IndexFailure = { kind: "failed"; errorCode: string; commitSha: string };
export type { GitSource };

/** Demande de page de `spec.architecture.components.list` : filtre de zone, recherche, position (curseur ou `around`), taille. */
export interface ComponentsRequest {
  zone?: string;
  q?: string;
  limit: number;
  cursor?: string;
  around?: string;
}

export interface ComponentRow {
  specId: string;
  path: string;
  data: unknown;
}

export interface ComponentsPage {
  items: ComponentRow[];
  nextCursor: string | null;
  previousCursor: string | null;
  offset: number;
  total: number;
  facets: Record<string, Record<string, number>>;
}

/** Demande de page de `spec.architecture.adr.list` : recherche, filtres, position (curseur ou `around`), taille. */
export interface AdrsRequest {
  q?: string;
  status?: string;
  component?: string;
  from?: string;
  to?: string;
  limit: number;
  cursor?: string;
  around?: string;
}

/** Une décision lue, avec sa remplaçante (pour sa date) et le commit indexé. */
export interface AdrFound {
  kind: "found";
  adr: ComponentRow;
  replacedBy: ComponentRow | null;
  commitSha: string;
}

/** Faits de l'index de tête dont se déduisent les avertissements, plus les propositions en attente du lancement ouvert. */
export interface ChecksFacts {
  features: string[];
  tables: string[];
  flows: string[];
  components: { specId: string; data: unknown }[];
  archflows: string[];
  pending: { kind: string; payload: unknown }[];
}

/** Lectures de l'index pour la page Architecture ; `null` : pas de dépôt de spec, révision non indexée ou entités non indexées. */
export interface SpecArchitectureRepository {
  componentsPage(
    scope: ProjectScope,
    revision: Revision,
    request: ComponentsRequest,
  ): Promise<IndexFailure | { kind: "page"; page: ComponentsPage } | null>;
  adrsPage(
    scope: ProjectScope,
    revision: Revision,
    request: AdrsRequest,
  ): Promise<IndexFailure | { kind: "page"; page: ComponentsPage } | null>;
  adr(
    scope: ProjectScope,
    revision: Revision,
    adrId: string,
  ): Promise<IndexFailure | AdrFound | null>;
  /** Où lire git (sections du document) : commit indexé, dossier de spec, dépôt, propriétaire et installation. */
  headSource(
    scope: ProjectScope,
    revision: Revision,
  ): Promise<IndexFailure | ({ kind: "found" } & GitSource) | null>;
  /** Index de tête et propositions `component` et `archflow` en attente du dernier lancement de l'architecture. */
  checkFacts(
    scope: ProjectScope,
  ): Promise<IndexFailure | { kind: "found"; facts: ChecksFacts } | null>;
}
