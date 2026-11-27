import type { NfrListInput, OperationListInput } from "@koklo/contract";
import type {
  ComponentRow,
  ComponentsPage,
  GitSource,
  IndexFailure,
} from "../spec-architecture/spec-architecture.repository.ts";
import type { Revision } from "../spec-read/spec-read.repository.ts";
import type { ProjectScope } from "../tracker/scope.ts";

export const SPEC_TECHNICAL_API_REPOSITORY = Symbol("SPEC_TECHNICAL_API_REPOSITORY");

interface PageRequest {
  limit: number;
  cursor?: string;
  around?: string;
}
export type OperationRequest = PageRequest & Pick<OperationListInput, "zone" | "q">;
export type NfrRequest = PageRequest & Pick<NfrListInput, "category">;

export type IndexedPage = IndexFailure | { kind: "page"; page: ComponentsPage } | null;

/** Une opération lue, avec ce qui l'accompagne dans la même tête : rôles, choix `ST-api` et source git. */
export interface OperationFound {
  kind: "found";
  row: ComponentRow;
  /** Données de l'entité des rôles, `null` sans fichier. */
  roles: unknown;
  /** Le choix `ST-api`, `null` s'il n'est pas à la tête. */
  contractStack: ComponentRow | null;
  source: GitSource;
}

/** Données des composants et des opérations (leurs zones) et du fichier des rôles. */
export interface OptionsFound {
  kind: "found";
  zoned: unknown[];
  roles: unknown;
}

export interface NfrFound {
  kind: "found";
  row: ComponentRow;
  commitSha: string;
}

/** Lectures de l'index pour les onglets API et Exigences ; `null` : rien d'indexé ou élément absent. */
export interface SpecTechnicalApiRepository {
  operationPage(
    scope: ProjectScope,
    revision: Revision,
    request: OperationRequest,
  ): Promise<IndexedPage>;
  operation(
    scope: ProjectScope,
    revision: Revision,
    id: string,
  ): Promise<IndexFailure | OperationFound | null>;
  options(scope: ProjectScope, revision: Revision): Promise<IndexFailure | OptionsFound | null>;
  nfrPage(scope: ProjectScope, revision: Revision, request: NfrRequest): Promise<IndexedPage>;
  nfr(scope: ProjectScope, revision: Revision, id: string): Promise<IndexFailure | NfrFound | null>;
}
