import type { PrismaClient } from "./generated/client.ts";
import { currentOrganizationId, MissingOrganizationContextError } from "./tenant-context.ts";

/**
 * Lectures de l'index générique `spec_entities` (TK-101, B329 e). Comme `searchIds`, exceptions étroites au refus du SQL
 * brut du client multi-tenant : contexte d'organisation exigé et toujours filtré, genres et jetons liés en paramètres,
 * jamais de la syntaxe SQL ou `tsquery` issue de la saisie.
 */
export interface EntityRef {
  kind: string;
  specId: string;
  title: string;
}

const organizationOf = (): string => {
  const organizationId = currentOrganizationId();
  if (!organizationId) {
    throw new MissingOrganizationContextError("spec_entities read outside withOrganization");
  }
  return organizationId;
};

/** `%`, `_` et `\` de la saisie deviennent des caractères ordinaires du motif `ILIKE`. */
export const likePrefixOf = (input: string): string =>
  `${input.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/**
 * Éléments de l'instantané des `kinds` dont l'identifiant commence par `q` OU dont l'identifiant et le titre contiennent
 * ses mots (`french`), triés par rang puis identifiant. `q` vide : les premiers éléments. Au plus `limit` lignes.
 */
export async function searchEntityRefs(
  raw: PrismaClient,
  snapshotId: string,
  kinds: readonly string[],
  q: string,
  limit: number,
): Promise<EntityRef[]> {
  const organizationId = organizationOf();
  const query = q.trim();
  const rows = await raw.$queryRaw<{ kind: string; spec_id: string; title: string }[]>`
    SELECT kind, spec_id, COALESCE(data ->> 'titre', '') AS title FROM spec_entities
     WHERE organization_id = ${organizationId}::uuid AND snapshot_id = ${snapshotId}::uuid
       AND kind = ANY(${[...kinds]}::text[])
       AND (${query} = '' OR spec_id ILIKE ${likePrefixOf(query)}
            OR search @@ plainto_tsquery('french', ${query}))
     ORDER BY sort, id
     LIMIT ${limit}`;
  return rows.map((row) => ({ kind: row.kind, specId: row.spec_id, title: row.title }));
}

/**
 * Éléments de l'instantané dont le contenu cite `specId` (jeton exact : `F-0031` ne cite pas `F-003`), hors l'élément
 * lui-même, triés par rang puis identifiant ; `total` les compte tous, `items` en garde `limit`.
 */
export async function entitiesReferencing(
  raw: PrismaClient,
  snapshotId: string,
  specId: string,
  limit: number,
): Promise<{ items: EntityRef[]; total: number }> {
  const organizationId = organizationOf();
  const rows = await raw.$queryRaw<
    { kind: string; spec_id: string; title: string; total: number }[]
  >`
    SELECT kind, spec_id, COALESCE(data ->> 'titre', '') AS title, (count(*) OVER ())::int AS total
      FROM spec_entities
     WHERE organization_id = ${organizationId}::uuid AND snapshot_id = ${snapshotId}::uuid
       AND NOT (kind = 'feature' AND spec_id = ${specId})
       AND data::text ~ ('(^|[^A-Za-z0-9-])' || ${specId} || '([^A-Za-z0-9-]|$)')
     ORDER BY sort, spec_id, kind
     LIMIT ${limit}`;
  return {
    items: rows.map((row) => ({ kind: row.kind, specId: row.spec_id, title: row.title })),
    total: rows[0]?.total ?? 0,
  };
}
