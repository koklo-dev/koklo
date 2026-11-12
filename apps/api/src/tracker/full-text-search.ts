import {
  type EntityRef,
  entitiesReferencing,
  type SearchTarget,
  searchEntityIds,
  searchEntityRefs,
  searchIds,
} from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";

/**
 * Recherche plein texte des listes longues. Le client multi-tenant refuse le SQL brut : la fonction
 * `searchIds` de `@koklo/db` est la seule exception, filtrée par l'organisation du contexte, et ne rend
 * que des identifiants que le dépôt relit ensuite par le client multi-tenant.
 */
@Injectable()
export class FullTextSearch {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  ids(target: SearchTarget, scopeId: string, query: string): Promise<string[]> {
    return searchIds(this.database.raw, target, scopeId, query);
  }

  /** Lignes d'un genre (règles, parcours) d'un instantané qui correspondent à la recherche (TK-103). */
  entityIds(snapshotId: string, kind: string, query: string): Promise<string[]> {
    return searchEntityIds(this.database.raw, snapshotId, kind, query);
  }

  /** Autocomplétion des liens (TK-101) : éléments de l'index générique d'un instantané, 20 au plus. */
  refs(
    snapshotId: string,
    kinds: readonly string[],
    query: string,
    limit: number,
  ): Promise<EntityRef[]> {
    return searchEntityRefs(this.database.raw, snapshotId, kinds, query, limit);
  }

  /** Éléments d'un instantané qui citent `specId` (jeton exact), `total` compris (TK-101). */
  referencing(snapshotId: string, specId: string, limit: number) {
    return entitiesReferencing(this.database.raw, snapshotId, specId, limit);
  }
}
