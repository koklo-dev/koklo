import { SEED_DATE } from "./seed-data.ts";
import type { SeedStatement } from "./seed-statements.ts";
import { SEED_VOLUMES, type VolumeProfile } from "./seed-volumes.ts";

/**
 * Instructions SQL des jeux de volume (TK-94). Chaque type de donnée est inséré par un seul
 * `INSERT ... SELECT generate_series` : 1 000 fonctionnalités et leurs critères tiennent en une poignée
 * de requêtes, sans aller-retour par ligne. Tout est déterministe (aucune horloge, aucun aléa) :
 * les identifiants dérivent de l'identifiant du projet (`md5(projet || ':' || nature)`), ce qui permet
 * de charger le même jeu dans plusieurs projets sans collision et de le recharger sans doublon.
 *
 * Paramètres de chaque requête : `$1` projet, `$2` organisation, `$3` date fixe.
 */
export interface VolumeTarget {
  organizationId: string;
  projectId: string;
}

/** Une requête ne reçoit que les paramètres qu'elle cite (`pg` refuse un paramètre en trop). */
const statementOf = (sql: string, target: VolumeTarget): SeedStatement => {
  const used = Math.max(...[...sql.matchAll(/\$(\d)/g)].map((match) => Number(match[1])));
  return { sql, params: [target.projectId, target.organizationId, SEED_DATE].slice(0, used) };
};

/**
 * UUID dérivé d'un texte : les 32 chiffres de `md5`, dont les quartets de version (8) et de variante
 * (a) sont fixés pour que l'identifiant soit un UUID valide aux yeux du contrat (`z.uuid()`).
 */
const uuidOf = (text: string) =>
  `overlay(overlay(md5(${text}) placing '8' from 13 for 1) placing 'a' from 17 for 1)::uuid`;
/** Identifiant dérivé d'une nature d'objet unique du projet (installation, dépôt, instantané…). */
const own = (kind: string) => uuidOf(`$1::text || ':${kind}'`);
/** Identifiant dérivé du n-ième objet d'une série. */
const nth = (kind: string, n = "n") => uuidOf(`$1::text || ':${kind}:' || ${n}`);
/** Au moins trois chiffres, sans jamais tronquer (`lpad` couperait 1000 en 100). */
const pad = (n = "n") => `lpad(${n}::text, GREATEST(3, length(${n}::text)), '0')`;
const pick = (values: readonly string[], index: string) =>
  `(ARRAY[${values.map((value) => `'${value}'`).join(", ")}])[1 + ${index}]`;

const FEATURE_STATUSES = ["brouillon", "specifiee", "implementee", "adoptee"] as const;
const FEATURE_PRIORITIES = ["must", "should", "could", "wont"] as const;
const TICKET_TYPES = ["feature", "bug", "task", "chore"] as const;
const TICKET_PRIORITIES = ["low", "medium", "high", "critical"] as const;
const TICKET_PACKAGES = [
  "web",
  "api",
  "worker",
  "contract",
  "db",
  "domain",
  "schema",
  "github",
  "rules",
  "delivery",
  "cli",
  "ui",
  "config",
  "e2e",
  "infra",
] as const;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** Verbes et compléments tournants : des titres lisibles, distincts, stables d'une exécution à l'autre. */
const VERBS = [
  "Gérer",
  "Consulter",
  "Exporter",
  "Importer",
  "Valider",
  "Suspendre",
  "Relancer",
  "Archiver",
  "Planifier",
] as const;
const NOUNS = [
  "les réservations",
  "le calendrier",
  "les paiements",
  "les clients",
  "les factures",
  "les notifications",
  "le planning",
  "les documents",
  "les accès",
  "les rapports",
] as const;

/** Titre connu des tests de recherche : le seul à contenir « annul » et « group ». */
const KNOWN_TITLE = "Annulation groupée des réservations";

/** Rang de l'élément au titre connu : la fonctionnalité tombe en page 15 de 50 sur `large`. */
const KNOWN_RANKS: Record<VolumeProfile, { feature: number; ticket: number }> = {
  large: { feature: 703, ticket: 313 },
  planche: { feature: 187, ticket: 41 },
};

const titleOf = (profile: VolumeProfile, kind: "feature" | "ticket") => {
  const known = KNOWN_RANKS[profile][kind];
  const generated = `${pick(VERBS, "n % 9")} || ' ' || ${pick(NOUNS, "(n / 9) % 10")} || ' (' || n || ')'`;
  return `CASE WHEN n = ${known} THEN '${KNOWN_TITLE}' ELSE ${generated} END`;
};

/** Répartition des statuts sur le total : la colonne « à faire » domine (142 sur 500), comme la planche. */
const STATUS_SHARES = [
  ["backlog", 0.24],
  ["todo", 0.284],
  ["in_progress", 0.06],
  ["in_review", 0.036],
  ["blocked", 0.02],
  ["done", 0.34],
  ["cancelled", 0.02],
] as const;

/** `CASE` qui fait tomber la permutation `v` de 0..total-1 dans un statut, selon les parts ci-dessus. */
function statusCase(total: number): string {
  let bound = 0;
  const branches = STATUS_SHARES.slice(0, -1).map(([status, share]) => {
    bound += Math.round(total * share);
    return `WHEN v < ${bound} THEN '${status}'`;
  });
  const last = STATUS_SHARES.at(-1)?.[0];
  return `CASE ${branches.join(" ")} ELSE '${last}' END`;
}

function repositoryStatements(target: VolumeTarget): SeedStatement[] {
  const at = "$3::timestamptz";
  const sql = [
    `INSERT INTO provider_installations (id, organization_id, provider, external_id, owner_kind, owner_login, status, created_at, updated_at)
     VALUES (${own("installation")}, $2, 'github', 'volume-' || $1::text, 'organization', 'volume', 'active', ${at}, ${at})
     ON CONFLICT (id) DO UPDATE SET status = 'active'`,
    `INSERT INTO project_repos (id, organization_id, project_id, installation_id, role, mode, external_id, owner_login, name, default_branch, spec_path, created_at, updated_at)
     VALUES (${own("repo")}, $2, $1::uuid, ${own("installation")}, 'spec', 'new', 'volume-repo-' || $1::text, 'volume', 'spec-volume', 'main', NULL, ${at}, ${at})
     ON CONFLICT (id) DO UPDATE SET role = 'spec'`,
    `INSERT INTO spec_snapshots (id, organization_id, repo_id, commit_sha, status, indexed_at, created_at, updated_at)
     VALUES (${own("snapshot")}, $2, ${own("repo")}, substr(md5($1::text || ':sha1') || md5($1::text || ':sha2'), 1, 40), 'ready', ${at}, ${at}, ${at})
     ON CONFLICT (id) DO UPDATE SET status = 'ready'`,
    `INSERT INTO spec_heads (organization_id, repo_id, branch, snapshot_id, created_at, updated_at)
     VALUES ($2, ${own("repo")}, 'main', ${own("snapshot")}, ${at}, ${at})
     ON CONFLICT (repo_id, branch) DO UPDATE SET snapshot_id = EXCLUDED.snapshot_id`,
  ];
  return sql.map((statement) => statementOf(statement, target));
}

function specStatements(profile: VolumeProfile, target: VolumeTarget): SeedStatement[] {
  const volume = SEED_VOLUMES[profile];
  const at = "$3::timestamptz";
  const base = (count: number) => `generate_series(1, ${count}) AS n`;
  const sql = [
    `INSERT INTO spec_features (id, organization_id, snapshot_id, spec_id, title, status, priority, file_path, created_at, updated_at)
     SELECT ${nth("feature")}, $2, ${own("snapshot")}, 'F-' || ${pad()}, ${titleOf(profile, "feature")},
            (${pick(FEATURE_STATUSES, "n % 4")})::feature_status,
            (${pick(FEATURE_PRIORITIES, "(n / 4) % 4")})::feature_priority,
            'features/F-' || ${pad()} || '.md', ${at}, ${at}
       FROM ${base(volume.features)}
     ON CONFLICT (snapshot_id, spec_id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status,
       priority = EXCLUDED.priority, file_path = EXCLUDED.file_path`,
    `INSERT INTO spec_criteria (id, organization_id, feature_id, spec_id, position, title, created_at, updated_at)
     SELECT ${nth("criterion", "n || ':' || c")}, $2, ${nth("feature")}, 'AC-' || c, c,
            'Critère ' || c || ' de F-' || ${pad()}, ${at}, ${at}
       FROM ${base(volume.features)}, generate_series(1, 4) AS c
      WHERE c <= 1 + (n % 4)
     ON CONFLICT (feature_id, spec_id) DO UPDATE SET title = EXCLUDED.title`,
    `INSERT INTO spec_tables (id, organization_id, snapshot_id, spec_id, file_path, created_at, updated_at)
     SELECT ${nth("table")}, $2, ${own("snapshot")}, 'T-table-' || ${pad()}, 'data/tables/table-' || ${pad()} || '.yaml', ${at}, ${at}
       FROM ${base(volume.tables)}
     ON CONFLICT (snapshot_id, spec_id) DO UPDATE SET file_path = EXCLUDED.file_path`,
    `INSERT INTO spec_endpoints (id, organization_id, snapshot_id, spec_id, method, path, file_path, created_at, updated_at)
     SELECT ${nth("endpoint")}, $2, ${own("snapshot")}, 'E-endpoint-' || ${pad()},
            (${pick(METHODS, "n % 5")})::endpoint_method, '/ressource-' || ${pad()},
            'api/endpoint-' || ${pad()} || '.yaml', ${at}, ${at}
       FROM ${base(volume.endpoints)}
     ON CONFLICT (snapshot_id, spec_id) DO UPDATE SET path = EXCLUDED.path, method = EXCLUDED.method`,
    // Liens : chaque fonctionnalité touche une table et un point d'accès, pour que les fiches en aient.
    `INSERT INTO spec_feature_tables (organization_id, feature_id, target_spec_id)
     SELECT $2, ${nth("feature")}, 'T-table-' || ${pad(`(1 + n % ${volume.tables})`)}
       FROM ${base(volume.features)}
     ON CONFLICT DO NOTHING`,
    `INSERT INTO spec_feature_endpoints (organization_id, feature_id, target_spec_id)
     SELECT $2, ${nth("feature")}, 'E-endpoint-' || ${pad(`(1 + n % ${volume.endpoints})`)}
       FROM ${base(volume.features)}
     ON CONFLICT DO NOTHING`,
  ];
  return sql.map((statement) => statementOf(statement, target));
}

function trackerStatements(profile: VolumeProfile, target: VolumeTarget): SeedStatement[] {
  const total = SEED_VOLUMES[profile].tickets;
  const at = "$3::timestamptz";
  const sql = [
    `INSERT INTO sprints (id, organization_id, project_id, number, key, goal, starts_on, ends_on, status, definition_of_done, created_at, updated_at)
     VALUES (${own("sprint")}, $2, $1::uuid, 1, 'SP-1', 'Tenir le volume réel', '2026-01-05', '2026-01-16', 'active',
             'Listes fluides et totaux justes', ${at}, ${at})
     ON CONFLICT (project_id, number) DO UPDATE SET goal = EXCLUDED.goal`,
    // `v` : permutation de 0..total-1 (37 est premier avec 500 et 60), pour mêler statuts et rangs.
    `INSERT INTO tickets (id, organization_id, project_id, key, title, description, type, status, priority, sprint_id, pkg, sensitivity, attempts, review_rounds, deleted_at, created_at, updated_at)
     SELECT ${nth("ticket")}, $2, $1::uuid, 'TK-' || n, ${titleOf(profile, "ticket")}, 'Jeu de volume ' || n,
            (${pick(TICKET_TYPES, "n % 4")})::ticket_type,
            (${statusCase(total)})::ticket_status,
            (${pick(TICKET_PRIORITIES, "(n / 4) % 4")})::ticket_priority,
            ${own("sprint")}, (${pick(TICKET_PACKAGES, "n % 15")})::ticket_package, 'safe', 0, 0, NULL,
            ${at} + (n || ' minutes')::interval, ${at}
       FROM (SELECT n, (n * 37) % ${total} AS v FROM generate_series(1, ${total}) AS n) AS series
     ON CONFLICT (project_id, key) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
       type = EXCLUDED.type, status = EXCLUDED.status, priority = EXCLUDED.priority,
       sprint_id = EXCLUDED.sprint_id, pkg = EXCLUDED.pkg, deleted_at = NULL`,
    // Le trigger interdit toute baisse d'un compteur : GREATEST le garde monotone.
    `INSERT INTO project_counters (organization_id, project_id, name, last_value, created_at, updated_at)
     VALUES ($2, $1::uuid, 'ticket', ${total}, ${at}, ${at}), ($2, $1::uuid, 'sprint', 1, ${at}, ${at})
     ON CONFLICT (project_id, name) DO UPDATE SET last_value = GREATEST(project_counters.last_value, EXCLUDED.last_value)`,
  ];
  return sql.map((statement) => statementOf(statement, target));
}

/** Toutes les instructions d'un profil dans l'ordre des clés étrangères (le projet existe déjà). */
export function buildVolumeStatements(
  profile: VolumeProfile,
  target: VolumeTarget,
): readonly SeedStatement[] {
  return [
    ...repositoryStatements(target),
    ...specStatements(profile, target),
    ...trackerStatements(profile, target),
  ];
}
