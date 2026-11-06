import { type SearchTarget, searchIds } from "@koklo/db";
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
}
