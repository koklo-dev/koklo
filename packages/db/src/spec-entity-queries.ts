import { SEARCH_LIMIT, tsqueryOf } from "./full-text.ts";
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

/** Motif « contient » : comme `likePrefixOf`, les jokers de la saisie deviennent des caractères ordinaires. */
const likeContainsOf = (input: string): string => `%${likePrefixOf(input).slice(0, -1)}%`;

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
       AND spec_id <> ${specId}
       AND data::text ~ ('(^|[^A-Za-z0-9-])' || ${specId} || '([^A-Za-z0-9-]|$)')
     ORDER BY sort, spec_id, kind
     LIMIT ${limit}`;
  return {
    items: rows.map((row) => ({ kind: row.kind, specId: row.spec_id, title: row.title })),
    total: rows[0]?.total ?? 0,
  };
}

/**
 * Identifiants (`id` de ligne) des éléments d'un genre de l'instantané dont l'identifiant commence par `q` OU dont l'identifiant
 * et le titre contiennent ses mots (`french`, le dernier en préfixe), ou, pour une table, dont un champ contient `q` : la recherche des listes de règles, de parcours et de tables, que
 * Prisma ne sait pas filtrer (colonne `tsvector`). `q` sans mot ni préfixe cherchable : liste vide. Au plus `SEARCH_LIMIT` lignes.
 */
export async function searchEntityIds(
  raw: PrismaClient,
  snapshotId: string,
  kind: string,
  q: string,
): Promise<string[]> {
  const organizationId = organizationOf();
  const query = tsqueryOf(q);
  // Une table se trouve aussi par le nom de l'un de ses champs (TK-107, B388) : `data -> 'champs'`, motif lié en paramètre.
  const rows = await raw.$queryRaw<{ id: string }[]>`
    SELECT id FROM spec_entities
     WHERE organization_id = ${organizationId}::uuid AND snapshot_id = ${snapshotId}::uuid AND kind = ${kind}
       AND (spec_id ILIKE ${likePrefixOf(q.trim())} OR (${query}::text IS NOT NULL AND search @@ to_tsquery('french', ${query}))
            OR (${kind} = 'table' AND EXISTS (
                  SELECT 1 FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof(data -> 'champs') = 'array' THEN data -> 'champs' ELSE '[]'::jsonb END
                  ) AS field WHERE field ->> 'nom' ILIKE ${likeContainsOf(q.trim())})))
     LIMIT ${SEARCH_LIMIT}`;
  return rows.map((row) => row.id);
}

/*
 * Liens d'une table vers une autre (B476) : relations déclarées (`relations[].vers`) et clés étrangères
 * (`champs[].type` en `ref(T-…)`), une seule fois par paire, sans boucle. C'est ce que trace le diagramme.
 */

/** Nombre de relations de chaque table (lignes `ids` de `spec_entities`) : liens qui partent d'elle ou la visent (B384, B476). */
export async function tableRelationCounts(
  raw: PrismaClient,
  snapshotId: string,
  ids: readonly string[],
): Promise<Map<string, number>> {
  const organizationId = organizationOf();
  const rows = await raw.$queryRaw<{ id: string; n: number }[]>`
    WITH tables AS (
      SELECT id, spec_id, data FROM spec_entities
       WHERE organization_id = ${organizationId}::uuid AND snapshot_id = ${snapshotId}::uuid AND kind = 'table'
    ), links AS (
      SELECT t.spec_id AS src, relation ->> 'vers' AS dst FROM tables t,
             jsonb_array_elements(CASE WHEN jsonb_typeof(t.data -> 'relations') = 'array' THEN t.data -> 'relations' ELSE '[]'::jsonb END) AS relation
      UNION
      SELECT t.spec_id, substring(field ->> 'type' FROM '^ref\\((T-[a-z0-9-]+)\\)$') FROM tables t,
             jsonb_array_elements(CASE WHEN jsonb_typeof(t.data -> 'champs') = 'array' THEN t.data -> 'champs' ELSE '[]'::jsonb END) AS field
    )
    SELECT t.id, (SELECT count(*) FROM links l
                   WHERE l.dst IS NOT NULL AND l.dst <> l.src AND (l.src = t.spec_id OR l.dst = t.spec_id))::int AS n
      FROM tables t
     WHERE t.id = ANY(${[...ids]}::uuid[])`;
  return new Map(rows.map((row) => [row.id, row.n]));
}

/** Relations de l'ensemble des tables de l'instantané, clés étrangères comprises (compteur d'en-tête de la page Données, B476). */
export async function tableRelationTotal(raw: PrismaClient, snapshotId: string): Promise<number> {
  const organizationId = organizationOf();
  const [row] = await raw.$queryRaw<{ n: number }[]>`
    WITH tables AS (
      SELECT spec_id, data FROM spec_entities
       WHERE organization_id = ${organizationId}::uuid AND snapshot_id = ${snapshotId}::uuid AND kind = 'table'
    ), links AS (
      SELECT t.spec_id AS src, relation ->> 'vers' AS dst FROM tables t,
             jsonb_array_elements(CASE WHEN jsonb_typeof(t.data -> 'relations') = 'array' THEN t.data -> 'relations' ELSE '[]'::jsonb END) AS relation
      UNION
      SELECT t.spec_id, substring(field ->> 'type' FROM '^ref\\((T-[a-z0-9-]+)\\)$') FROM tables t,
             jsonb_array_elements(CASE WHEN jsonb_typeof(t.data -> 'champs') = 'array' THEN t.data -> 'champs' ELSE '[]'::jsonb END) AS field
    )
    SELECT count(*)::int AS n FROM links WHERE dst IS NOT NULL AND dst <> src`;
  return row?.n ?? 0;
}

/** Comptes de tables par zone (`data.zone`), restreints aux lignes `ids` quand elles sont données (recherche en cours). */
export async function tableZoneFacets(
  raw: PrismaClient,
  snapshotId: string,
  ids: readonly string[] | null,
): Promise<Record<string, number>> {
  const organizationId = organizationOf();
  const rows = await raw.$queryRaw<{ zone: string; n: number }[]>`
    SELECT data ->> 'zone' AS zone, count(*)::int AS n FROM spec_entities
     WHERE organization_id = ${organizationId}::uuid AND snapshot_id = ${snapshotId}::uuid AND kind = 'table'
       AND data ->> 'zone' IS NOT NULL AND (${ids === null ? null : [...ids]}::uuid[] IS NULL OR id = ANY(${ids === null ? null : [...ids]}::uuid[]))
     GROUP BY 1 ORDER BY 1`;
  return Object.fromEntries(rows.map((row) => [row.zone, row.n]));
}
