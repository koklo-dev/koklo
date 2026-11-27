import type { SeedStatement } from "./seed-statements.ts";
import {
  PLANCHE_ASVS,
  PLANCHE_RIGHTS,
  PLANCHE_SUMMARY,
  PLANCHE_THREATS,
} from "./seed-volume-security-planche.ts";
import { nth, own, pad, pick, statementOf, type VolumeTarget } from "./seed-volume-sql.ts";
import { SEED_VOLUMES, type VolumeProfile } from "./seed-volumes.ts";

/**
 * Livrable Sécurité des jeux de volume (TK-117), aux formes de l'index du worker : menaces triées par surface puis numéro,
 * données classées depuis les champs des tables du jeu. `planche` : les 18 menaces de la maquette 15, tous les champs
 * classés sauf la durée d'une donnée sensible ; droits, exigences et résumé. `large` : 400 menaces, une table sur dix non
 * classée. Aucune proposition. Déterministe : aucune horloge, aucun aléa.
 */
const AT = "$3::timestamptz";
const CATEGORIES = [
  "usurpation",
  "acces_non_autorise",
  "fuite_donnees",
  "alteration",
  "abus",
  "conformite",
] as const;
const SEVERITIES = ["moyenne", "faible", "moyenne", "elevee"] as const;
/** Rang de la surface « API » dans le tri, après les fonctionnalités. */
const API_RANK = 100_000;

const literal = (value: unknown) => `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;

/** Insertion d'entités de la Sécurité depuis `source` : `n`, `spec_id`, `path`, `data` et `sort`. */
const insert = (kind: string, source: string): string =>
  `INSERT INTO spec_entities (id, organization_id, snapshot_id, kind, spec_id, zone, path, data, content_hash, sort, created_at, updated_at)
   SELECT ${nth(`entity:${kind}`)}, $2, ${own("snapshot")}, '${kind}', spec_id, NULL, path, data,
          encode(sha256(convert_to('${kind}:' || spec_id || ':' || data::text, 'UTF8')), 'hex'), sort, ${AT}, ${AT}
     FROM (${source}) AS series
   ON CONFLICT (snapshot_id, kind, spec_id) DO UPDATE SET path = EXCLUDED.path, data = EXCLUDED.data,
     content_hash = EXCLUDED.content_hash, sort = EXCLUDED.sort`;

/** Rang d'une surface `F-nnn` ou `api`, pour le tri surface puis identifiant. */
const surfaceRank = (surface: string): string =>
  `CASE WHEN ${surface} = 'api' THEN ${API_RANK} ELSE substr(${surface}, 3)::int END`;

const sortedThreats = (source: string): string =>
  insert(
    "threat",
    `SELECT n, data ->> 'id' AS spec_id, 'security/threats/' || (data ->> 'id') || '.yaml' AS path, data,
            row_number() OVER (ORDER BY ${surfaceRank("data -> 'surfaces' ->> 0")}, n)::int AS sort
       FROM (${source}) AS threats`,
  );

const plancheThreats = (): string =>
  sortedThreats(
    `SELECT n::int AS n, data FROM jsonb_array_elements(${literal(PLANCHE_THREATS)}) WITH ORDINALITY AS rows(data, n)`,
  );

function largeThreats(count: number): string {
  const surface = `CASE WHEN n % 12 = 0 THEN 'api' ELSE 'F-' || ${pad("(1 + n % 40)")} END`;
  const id = `'SEC-T' || ${pad()}`;
  return sortedThreats(
    `SELECT n, jsonb_build_object('id', ${id}, 'titre', 'Menace de volume ' || n,
       'surfaces', jsonb_build_array(${surface}), 'categorie', ${pick(CATEGORIES, "n % 6")},
       'gravite', ${pick(SEVERITIES, "n % 4")}, 'risque', 'Risque de volume ' || n || '.',
       'parades', CASE WHEN n % 20 = 0 THEN '[]'::jsonb ELSE jsonb_build_array('Parade de volume.') END,
       'verification', jsonb_build_object('mode', CASE WHEN n % 7 = 0 THEN 'controle_ci' ELSE 'scenario' END),
       'liens', '[]'::jsonb) AS data
     FROM generate_series(1, ${count}) AS n`,
  );
}

/**
 * Entrées de `security/data.yaml` composées depuis les champs des tables du jeu : par table, les e-mails (contact, durée
 * saisie) et le reste (technique). `planche` : le champ « nom » de la première table est une donnée sensible sans durée.
 * `large` : une table sur dix reste non classée.
 */
function entries(profile: VolumeProfile): string {
  const planche = profile === "planche";
  const sensitive = planche ? "WHEN n = 1 AND name = 'nom' THEN 'sensible'" : "";
  const skipped = planche ? "" : "WHERE n % 10 <> 0";
  return insert(
    "sensitive",
    `WITH tables AS MATERIALIZED (
       SELECT row_number() OVER (ORDER BY spec_id)::int AS n, substr(spec_id, 3) AS slug, data -> 'champs' AS champs
         FROM spec_entities WHERE snapshot_id = ${own("snapshot")} AND kind = 'table'
     ), fields AS MATERIALIZED (
       SELECT n, slug, field ->> 'nom' AS name, ord FROM tables, jsonb_array_elements(champs) WITH ORDINALITY AS f(field, ord)
     ), grouped AS (
       SELECT slug, n,
              CASE ${sensitive} WHEN name = 'email' THEN 'contact' ELSE 'technique' END AS category,
              array_agg(slug || '.' || name ORDER BY ord) AS refs
         FROM fields ${skipped} GROUP BY 1, 2, 3
     )
     SELECT row_number() OVER (ORDER BY refs[1])::int AS n, refs[1] AS spec_id, 'security/data.yaml' AS path,
            jsonb_strip_nulls(jsonb_build_object(
              'donnee', initcap(category) || ' de ' || slug, 'titre', initcap(category) || ' de ' || slug,
              'champs', to_jsonb(refs), 'categorie', category,
              'conservation', CASE WHEN category = 'contact' THEN '3 ans après le dernier rendez-vous' END,
              'acces', jsonb_build_array('Accueil'))) AS data,
            row_number() OVER (ORDER BY refs[1])::int AS sort
       FROM grouped`,
  );
}

const single = (kind: string, specId: string, path: string, data: unknown): string =>
  insert(
    kind,
    `SELECT 1 AS n, '${specId}' AS spec_id, '${path}' AS path, ${literal(data)} AS data, 1 AS sort`,
  );

const plancheFiles = (): string[] => [
  single("rights", "rights", "security/rights.yaml", PLANCHE_RIGHTS),
  single("asvs", "asvs", "security/asvs.yaml", PLANCHE_ASVS),
  single("security_summary", "summary", "security/summary.md", PLANCHE_SUMMARY),
];

const counter = (count: number): string =>
  `INSERT INTO project_counters (organization_id, project_id, name, last_value, created_at, updated_at)
   VALUES ($2, $1::uuid, 'threat', ${count}, ${AT}, ${AT})
   ON CONFLICT (project_id, name) DO UPDATE SET last_value = GREATEST(project_counters.last_value, EXCLUDED.last_value)`;

export function securityStatements(
  profile: VolumeProfile,
  target: VolumeTarget,
): readonly SeedStatement[] {
  const { threats } = SEED_VOLUMES[profile];
  const planche = profile === "planche";
  return [
    planche ? plancheThreats() : largeThreats(threats),
    entries(profile),
    ...(planche ? plancheFiles() : []),
    counter(threats),
  ].map((sql) => statementOf(sql, target));
}
