import type { ProjectScope } from "../tracker/scope.ts";

export const CLIENT_SPACE_ARCHITECTURE_REPOSITORY = Symbol("CLIENT_SPACE_ARCHITECTURE_REPOSITORY");

/** Composants de la tête (au plus `max`), nom de chacun d'eux et libellé des fonctionnalités citées ; `truncated` : il y en avait davantage. */
export interface ClientArchitectureRead {
  components: { specId: string; data: unknown }[];
  truncated: boolean;
  /** `C-slug` -> nom, pour tous les composants de la tête (une dépendance vers un composant hors des `max` première reste nommée). */
  names: Map<string, string>;
  /** `F-nnn` -> libellé lisible (une fonctionnalité absente de l'index n'y figure pas). */
  labels: Map<string, string>;
}

/** Lecture des composants pour le client (TK-113) : index d'entités de la tête, aucune écriture, aucun réseau. */
export interface ClientSpaceArchitectureRepository {
  /** `null` : aucune spec indexée ou index en échec. */
  read(scope: ProjectScope, max: number): Promise<ClientArchitectureRead | null>;
}
