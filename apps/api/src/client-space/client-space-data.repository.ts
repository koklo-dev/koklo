import type { ProjectScope } from "../tracker/scope.ts";

export const CLIENT_SPACE_DATA_REPOSITORY = Symbol("CLIENT_SPACE_DATA_REPOSITORY");

/** Tables du modèle (au plus `max`), libellés des fonctionnalités et règles citées ; `truncated` : il y en avait davantage. */
export interface ClientModelRead {
  tables: { specId: string; data: unknown }[];
  truncated: boolean;
  /** `F-nnn` et `R-nnn` cités par les tables -> libellé lisible (un amont absent de l'index n'y figure pas). */
  labels: Map<string, string>;
}

export interface ClientFixtureRead {
  specId: string;
  path: string;
  data: unknown;
}

/** Lectures du modèle de données pour le client (TK-109) : index d'entités de la tête, aucune écriture, aucun réseau. */
export interface ClientSpaceDataRepository {
  /** `null` : aucune spec indexée ou index en échec. */
  model(scope: ProjectScope, max: number): Promise<ClientModelRead | null>;
  /** Toutes les tables de la tête, sans la borne du modèle (zones, TK-110) ; `null` : aucune spec indexée ou index en échec. */
  tables(scope: ProjectScope): Promise<{ specId: string; data: unknown }[] | null>;
  /** Libellés des fonctionnalités et règles `ids` (`F-nnn`, `R-nnn`) ; un amont absent de l'index n'y figure pas. */
  labels(scope: ProjectScope, ids: readonly string[]): Promise<Map<string, string>>;
  /** Tables dont le nom ou un champ correspond à `q`, `limit` au plus ; rien d'indexé : liste vide. */
  searchTables(
    scope: ProjectScope,
    q: string,
    limit: number,
  ): Promise<{ specId: string; data: unknown }[]>;
  fixtures(scope: ProjectScope): Promise<ClientFixtureRead[]>;
  fixture(scope: ProjectScope, specId: string): Promise<ClientFixtureRead | null>;
}
