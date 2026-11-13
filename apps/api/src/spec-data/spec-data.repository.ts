import type { Revision } from "../spec-read/spec-read.repository.ts";
import type { ProjectScope } from "../tracker/scope.ts";

export const SPEC_DATA_REPOSITORY = Symbol("SPEC_DATA_REPOSITORY");

export type IndexFailure = { kind: "failed"; errorCode: string; commitSha: string };

/** Demande de page de `spec.data.tables.list` : filtre de zone, recherche, position (curseur ou `around`), taille. */
export interface TablesRequest {
  zone?: string;
  q?: string;
  limit: number;
  cursor?: string;
  around?: string;
}

export interface TableRow {
  specId: string;
  path: string;
  data: unknown;
  /** Relations déclarées par la table + relations qui la visent. */
  relationCount: number;
}

export interface TablesPage {
  items: TableRow[];
  nextCursor: string | null;
  previousCursor: string | null;
  offset: number;
  total: number;
  facets: Record<string, Record<string, number>>;
}

/** Ce qu'il faut pour lire `data/model.mmd` dans git (décidé sur l'index avant tout réseau) et, à défaut, le générer. */
export interface ModelSource {
  kind: "found";
  commitSha: string;
  /** Dossier de la spec dans un monorepo, sinon `null`. */
  specPath: string | null;
  repoName: string;
  owner: { kind: "organization" | "user"; login: string };
  installation: { id: string; externalId: string; active: boolean };
  /** `data` des tables indexées, dans l'ordre de l'index. */
  tables: unknown[];
}

export interface EntityRowData {
  specId: string;
  path: string;
  data: unknown;
}

/** Lectures de l'index pour la page Données ; `null` : pas de dépôt de spec, révision non indexée ou entités non indexées. */
export interface SpecDataRepository {
  tablesPage(
    scope: ProjectScope,
    revision: Revision,
    request: TablesRequest,
  ): Promise<IndexFailure | { kind: "page"; page: TablesPage } | null>;
  modelSource(scope: ProjectScope, revision: Revision): Promise<IndexFailure | ModelSource | null>;
  fixtures(
    scope: ProjectScope,
    revision: Revision,
  ): Promise<IndexFailure | { kind: "found"; commitSha: string; rows: EntityRowData[] } | null>;
  fixture(
    scope: ProjectScope,
    revision: Revision,
    specId: string,
  ): Promise<IndexFailure | ({ kind: "found"; commitSha: string } & EntityRowData) | null>;
}
