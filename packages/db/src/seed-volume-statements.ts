import type { SeedStatement } from "./seed-statements.ts";
import { proposalStatements } from "./seed-volume-proposals.ts";
import {
  NOUNS,
  nth,
  own,
  pad,
  pick,
  statementOf,
  VERBS,
  type VolumeTarget,
} from "./seed-volume-sql.ts";
import { SEED_VOLUMES, type VolumeProfile } from "./seed-volumes.ts";

/**
 * Instructions SQL des jeux de volume (TK-94). Chaque type de donnée est inséré par un seul
 * `INSERT ... SELECT generate_series` : 1 000 fonctionnalités et leurs critères tiennent en une poignée
 * de requêtes, sans aller-retour par ligne. Tout est déterministe (aucune horloge, aucun aléa) :
 * les identifiants dérivent de l'identifiant du projet (`md5(projet || ':' || nature)`), ce qui permet
 * de charger le même jeu dans plusieurs projets sans collision et de le recharger sans doublon.
 *
 * Paramètres de chaque requête : `$1` projet, `$2` organisation, `$3` date fixe. Briques communes : `seed-volume-sql.ts`.
 */
export type { VolumeTarget } from "./seed-volume-sql.ts";

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

/** Hachage de contenu d'une entité : 64 hexadécimaux déterministes, dérivés de son genre, son identifiant et son titre. */
const entityHash = (kind: string, id: string, title: string) =>
  `encode(sha256(convert_to('${kind}:' || ${id} || ':' || ${title}, 'UTF8')), 'hex')`;

/**
 * Index générique `spec_entities` (TK-101, B329 e) : une ligne par fonctionnalité, table et point d'accès du jeu, avec
 * `titre`, chemin, rang et hachage, puis `entities_indexed_at` sur l'instantané (sans lui, `spec.refs.search` rend une liste
 * vide). Mêmes identifiants et mêmes titres que `spec_features`, `spec_tables` et `spec_endpoints`.
 */
function entityStatements(profile: VolumeProfile, target: VolumeTarget): SeedStatement[] {
  const volume = SEED_VOLUMES[profile];
  const at = "$3::timestamptz";
  const entity = (kind: string, count: number, spec: string, title: string, path: string) => {
    const id = `${spec} || ${pad()}`;
    return `INSERT INTO spec_entities (id, organization_id, snapshot_id, kind, spec_id, zone, path, data, content_hash, sort, created_at, updated_at)
     SELECT ${nth(`entity:${kind}`)}, $2, ${own("snapshot")}, '${kind}', ${id}, NULL, ${path},
            jsonb_build_object('titre', ${title}), ${entityHash(kind, id, title)}, n, ${at}, ${at}
       FROM generate_series(1, ${count}) AS n
     ON CONFLICT (snapshot_id, kind, spec_id) DO UPDATE SET path = EXCLUDED.path, data = EXCLUDED.data,
       content_hash = EXCLUDED.content_hash, sort = EXCLUDED.sort`;
  };
  const sql = [
    entity(
      "feature",
      volume.features,
      "'F-'",
      titleOf(profile, "feature"),
      `'features/F-' || ${pad()} || '.md'`,
    ),
    entity(
      "table",
      volume.tables,
      "'T-table-'",
      `'Table ' || ${pad()}`,
      `'data/tables/table-' || ${pad()} || '.yaml'`,
    ),
    entity(
      "endpoint",
      volume.endpoints,
      "'E-endpoint-'",
      `(${pick(METHODS, "n % 5")}) || ' /ressource-' || ${pad()}`,
      `'api/endpoint-' || ${pad()} || '.yaml'`,
    ),
    `UPDATE spec_snapshots SET entities_indexed_at = ${at} WHERE id = ${own("snapshot")} AND organization_id = $2`,
  ];
  return sql.map((statement) => statementOf(statement, target));
}

/** Titre connu des tests de recherche des règles : le seul à contenir « tardive », au rang 250 (page 11 de 24 sur `large`). */
const KNOWN_RULE_TITLE = "Annulation tardive d'une réservation";
const KNOWN_RULE_RANK = 250;
const RULE_TITLES = [
  "Unicité de l'adresse e-mail",
  "Calcul du total TTC",
  "Cycle de vie d'une réservation",
  "Plafond de paiement",
  "Délai de remboursement",
  "Statut d'une facture",
  "Durée de conservation des documents",
  "Droit d'accès au planning",
] as const;
const FLOW_ACTORS = ["Visiteur", "Gestionnaire", "Client", "Administrateur"] as const;

/** Ressources du jeu de permissions : 12 groupes, 47 actions (6, 6, 5, 5, 5, 4, 4, 3, 3, 2, 2, 2). */
const PERMISSION_GROUPS: readonly (readonly [string, string, number])[] = [
  ["agenda", "l'agenda", 6],
  ["reservations", "les réservations", 6],
  ["clients", "les clients", 5],
  ["paiements", "les paiements", 5],
  ["factures", "les factures", 5],
  ["documents", "les documents", 4],
  ["notifications", "les notifications", 4],
  ["rapports", "les rapports", 3],
  ["acces", "les accès", 3],
  ["equipes", "les équipes", 2],
  ["parametres", "les paramètres", 2],
  ["journal", "le journal", 2],
];
const PERMISSION_ACTIONS = [
  ["lire", "Consulter"],
  ["creer", "Créer"],
  ["modifier", "Modifier"],
  ["supprimer", "Supprimer"],
  ["exporter", "Exporter"],
  ["archiver", "Archiver"],
] as const;

/** Permissions du jeu : `PM-<ressource>.<action>`, libellé métier, ressource et action lisibles. */
function permissionsOf(count: number) {
  return PERMISSION_GROUPS.flatMap(([resource, label, size]) =>
    PERMISSION_ACTIONS.slice(0, size).map(([action, verb]) => ({
      id: `PM-${resource}.${action}`,
      libelle: `${verb} ${label}`,
      action,
      ressource: resource,
      conditions: [] as string[],
      endpoints: [] as string[],
    })),
  ).slice(0, count);
}

/** Rôles du jeu : un administrateur (tout), un gestionnaire (sans suppression, restreint sur l'agenda), un lecteur. */
function rolesOf(permissions: readonly { id: string; action: string }[], count: number) {
  const ids = (keep: (action: string) => boolean) =>
    permissions.filter(({ action }) => keep(action)).map(({ id }) => id);
  return [
    {
      id: "RL-administrateur",
      nom: "Administrateur",
      description: "Gère tout le produit livré.",
      permissions: ids(() => true),
    },
    {
      id: "RL-gestionnaire",
      nom: "Gestionnaire",
      description: "Gère l'activité courante, sans supprimer.",
      permissions: ids((action) => action !== "supprimer"),
      restrictions: { "PM-agenda.modifier": "les siennes", "PM-agenda.creer": "pour son équipe" },
    },
    {
      id: "RL-lecteur",
      nom: "Lecteur",
      description: "Consulte sans rien modifier.",
      permissions: ids((action) => action === "lire"),
    },
  ].slice(0, count);
}

/** Littéral SQL d'un document JSON (apostrophes doublées). */
const jsonLiteral = (value: unknown) => `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;

/**
 * Règles, parcours, rôles et permissions de l'index d'entités (TK-103, B343) : mêmes formes que celles que le worker écrit
 * depuis `domain/rules/R-nnn-*.md`, `design/flows/P-*.yaml` et `domain/roles.yaml` (une seule ligne `roles`, `sort` = rang
 * numérique de `R-nnn`).
 */
function domainStatements(profile: VolumeProfile, target: VolumeTarget): SeedStatement[] {
  const volume = SEED_VOLUMES[profile];
  const at = "$3::timestamptz";
  const columns =
    "id, organization_id, snapshot_id, kind, spec_id, zone, path, data, content_hash, sort, created_at, updated_at";
  const conflict = `ON CONFLICT (snapshot_id, kind, spec_id) DO UPDATE SET path = EXCLUDED.path, data = EXCLUDED.data,
       content_hash = EXCLUDED.content_hash, sort = EXCLUDED.sort`;
  const ruleTitle = `CASE WHEN n = ${KNOWN_RULE_RANK} THEN '${KNOWN_RULE_TITLE.replace(/'/g, "''")}'
       ELSE ${pick(RULE_TITLES, "n % 8")} || ' (' || n || ')' END`;
  const rule = `INSERT INTO spec_entities (${columns})
     SELECT ${nth("entity:rule")}, $2, ${own("snapshot")}, 'rule', 'R-' || ${pad()}, 'functional',
            'domain/rules/R-' || ${pad()} || '-regle-' || ${pad()} || '.md',
            jsonb_build_object('id', 'R-' || ${pad()}, 'titre', title, 'type', typ, 'tables', '[]'::jsonb,
              'endpoints', '[]'::jsonb,
              'fonctionnalites', jsonb_build_array('F-' || ${pad(`(1 + n % ${volume.features})`)}),
              'enonce', 'Énoncé de la règle ' || n || ' : ' || title || '.',
              'exemples', jsonb_build_array('Exemple de la règle ' || n || '.'))
              || CASE WHEN typ = 'workflow'
                   THEN jsonb_build_object('etats', jsonb_build_array('Brouillon', 'En validation', 'Validée', 'Archivée'))
                   ELSE '{}'::jsonb END,
            ${entityHash("rule", `'R-' || ${pad()}`, "title")}, n, ${at}, ${at}
       FROM (SELECT n, ${ruleTitle} AS title, ${pick(["contrainte", "calcul", "workflow"], "n % 3")} AS typ
               FROM generate_series(1, ${volume.rules}) AS n) AS series
     ${conflict}`;
  const flowId = `'P-parcours-' || ${pad()}`;
  const flow = `INSERT INTO spec_entities (${columns})
     SELECT ${nth("entity:flow")}, $2, ${own("snapshot")}, 'flow', ${flowId}, 'functional',
            'design/flows/P-parcours-' || ${pad()} || '.yaml',
            jsonb_build_object('id', ${flowId}, 'titre', title, 'acteur', ${pick(FLOW_ACTORS, "n % 4")},
              'depart', jsonb_build_object('libelle', 'Ouvrir l''écran d''accueil', 'ecran', 'S-accueil'),
              'etapes', (SELECT jsonb_agg(jsonb_build_object('libelle', 'Étape ' || (k + 1) || ' du parcours ' || n,
                           'ecran', 'S-ecran-' || k) ORDER BY k) FROM generate_series(1, 2 + n % 3) AS k),
              'erreurs', CASE WHEN n % 2 = 0
                           THEN jsonb_build_array(jsonb_build_object('etape', 2, 'texte', 'Le service est indisponible'))
                           ELSE '[]'::jsonb END,
              'fonctionnalites', jsonb_build_array('F-001', 'F-004')),
            ${entityHash("flow", flowId, "title")}, n, ${at}, ${at}
       FROM (SELECT n, 'Parcours ' || n || ' : ' || ${pick(VERBS, "n % 9")} || ' ' || ${pick(NOUNS, "n % 10")} AS title
               FROM generate_series(1, ${volume.flows}) AS n) AS series
     ${conflict}`;
  const permissions = permissionsOf(volume.permissions);
  const file = {
    titre: "Rôles et permissions",
    roles: rolesOf(permissions, volume.roles),
    permissions,
  };
  const roles = `INSERT INTO spec_entities (${columns})
     VALUES (${own("entity:roles")}, $2, ${own("snapshot")}, 'roles', 'roles', 'functional', 'domain/roles.yaml',
             ${jsonLiteral(file)},
             encode(sha256(convert_to('roles:' || ${jsonLiteral(file)}::text, 'UTF8')), 'hex'), 1, ${at}, ${at})
     ${conflict}`;
  return [rule, flow, roles].map((sql) => statementOf(sql, target));
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
    ...entityStatements(profile, target),
    ...domainStatements(profile, target),
    ...trackerStatements(profile, target),
    ...proposalStatements(profile, target),
  ];
}
