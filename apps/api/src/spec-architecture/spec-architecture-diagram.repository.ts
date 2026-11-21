import type { Revision } from "../spec-read/spec-read.repository.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { GitSource, IndexFailure } from "./spec-architecture.repository.ts";

export const SPEC_ARCHITECTURE_DIAGRAM_REPOSITORY = Symbol("SPEC_ARCHITECTURE_DIAGRAM_REPOSITORY");

export interface EntityData {
  specId: string;
  path: string;
  data: unknown;
}

/** Composants, flux et rôles de la tête, avec de quoi lire git : tout ce qu'il faut pour les zones et le schéma Mermaid. */
export interface DiagramModel extends GitSource {
  kind: "found";
  components: EntityData[];
  /** Flux techniques `archflow` (leurs participants). */
  flows: EntityData[];
  /** Données de l'entité `roles` (`domain/roles.yaml`), `null` sans fichier de rôles. */
  roles: unknown;
}

/** Demande de page de `flows.list` : recherche, position (curseur ou `around`), taille. */
export interface FlowsRequest {
  q?: string;
  limit: number;
  cursor?: string;
  around?: string;
}

/** Une page de flux et de quoi nommer leurs lignes : parcours du même identifiant, composants cités, rôles. */
export interface FlowsPage {
  items: EntityData[];
  nextCursor: string | null;
  previousCursor: string | null;
  offset: number;
  total: number;
  parcours: EntityData[];
  components: EntityData[];
  roles: unknown;
}

/** Un flux et de quoi le nommer et lire son fichier (détail, YAML, Mermaid). */
export interface FlowFound extends GitSource {
  kind: "found";
  flow: EntityData;
  parcours: EntityData | null;
  components: EntityData[];
  roles: unknown;
}

export interface ComponentFound extends GitSource {
  kind: "found";
  component: EntityData;
}

/** Lectures de l'index pour le schéma et les flux (TK-112) ; `null` : rien d'indexé, ou élément inconnu. */
export interface SpecArchitectureDiagramRepository {
  model(scope: ProjectScope, revision: Revision): Promise<IndexFailure | DiagramModel | null>;
  /** Où lire git seulement (`architecture/_layout.yaml`). */
  headSource(
    scope: ProjectScope,
    revision: Revision,
  ): Promise<IndexFailure | ({ kind: "found" } & GitSource) | null>;
  searchComponents(
    scope: ProjectScope,
    revision: Revision,
    q: string,
    limit: number,
  ): Promise<IndexFailure | { kind: "found"; rows: EntityData[] } | null>;
  flowsPage(
    scope: ProjectScope,
    revision: Revision,
    request: FlowsRequest,
  ): Promise<IndexFailure | { kind: "page"; page: FlowsPage } | null>;
  flow(
    scope: ProjectScope,
    revision: Revision,
    flowId: string,
  ): Promise<IndexFailure | FlowFound | null>;
  component(
    scope: ProjectScope,
    revision: Revision,
    componentId: string,
  ): Promise<IndexFailure | ComponentFound | null>;
}
