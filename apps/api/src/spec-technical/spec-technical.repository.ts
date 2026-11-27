import type {
  ComponentRow,
  ComponentsPage,
  GitSource,
  IndexFailure,
} from "../spec-architecture/spec-architecture.repository.ts";
import type { Revision } from "../spec-read/spec-read.repository.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { technicalCounts } from "./technical-values.ts";

export const SPEC_TECHNICAL_REPOSITORY = Symbol("SPEC_TECHNICAL_REPOSITORY");

/** Demande de page de `spec.technical.stack.list` : recherche, position (curseur ou `around`), taille. */
export interface StackRequest {
  q?: string;
  limit: number;
  cursor?: string;
  around?: string;
}

/** Un choix lu, avec le dépôt et le commit indexés (pour lire son fichier). */
export interface StackFound {
  kind: "found";
  row: ComponentRow;
  source: GitSource;
}

/** L'entité `environments` (`null` sans fichier) au commit indexé. */
export interface EnvironmentsFound {
  kind: "found";
  row: ComponentRow | null;
  commitSha: string;
}

/** Lectures de l'index pour la page Technique ; `null` : pas de dépôt de spec, révision non indexée ou élément absent. */
export interface SpecTechnicalRepository {
  stackPage(
    scope: ProjectScope,
    revision: Revision,
    request: StackRequest,
  ): Promise<IndexFailure | { kind: "page"; page: ComponentsPage } | null>;
  stack(
    scope: ProjectScope,
    revision: Revision,
    id: string,
  ): Promise<IndexFailure | StackFound | null>;
  environments(
    scope: ProjectScope,
    revision: Revision,
  ): Promise<IndexFailure | EnvironmentsFound | null>;
  /** Comptes de la tête, dont les opérations `zone.verbe` seules ; `null` : rien d'indexé. */
  counts(
    scope: ProjectScope,
  ): Promise<(ReturnType<typeof technicalCounts> & { operations: number }) | null>;
}
