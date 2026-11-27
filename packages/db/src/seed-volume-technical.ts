import type { SeedStatement } from "./seed-statements.ts";
import { nth, own, pad, pick, statementOf, type VolumeTarget } from "./seed-volume-sql.ts";
import { PLANCHE_STACKS } from "./seed-volume-technical-planche.ts";
import { SEED_VOLUMES, type VolumeProfile } from "./seed-volumes.ts";

/**
 * Cahier technique des jeux de volume (TK-115, B736), aux formes de l'index du worker : choix de la stack (triés par couche),
 * opérations `zone.verbe`, exigences et le bloc des environnements. `planche` : les rôles de la maquette 14 ; `large` : 300
 * choix, 500 opérations, 200 exigences. Aucune proposition technique. Déterministe : aucune horloge, aucun aléa.
 */
const LAYERS = ["applications", "services", "donnees", "externes", "exploitation"] as const;
const AT = "$3::timestamptz";
/** Choix au rôle unique (« attestations »), en 5e page de la grille sur `large`. */
const KNOWN_STACK_RANK = 201;
const KNOWN_STACK_ROLE = "Génération des attestations de dépôt";

const literal = (value: unknown) => `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;

/** Insertion d'un genre d'entité depuis `source`, qui expose `n`, `spec_id`, `path`, `data` et `sort`. */
const insert = (kind: string, idKind: string, source: string): string =>
  `INSERT INTO spec_entities (id, organization_id, snapshot_id, kind, spec_id, zone, path, data, content_hash, sort, created_at, updated_at)
   SELECT ${nth(`entity:${idKind}`)}, $2, ${own("snapshot")}, '${kind}', spec_id, 'technical', path, data,
          encode(sha256(convert_to('${kind}:' || spec_id || ':' || data::text, 'UTF8')), 'hex'), sort, ${AT}, ${AT}
     FROM (${source}) AS series
   ON CONFLICT (snapshot_id, kind, spec_id) DO UPDATE SET path = EXCLUDED.path, data = EXCLUDED.data,
     content_hash = EXCLUDED.content_hash, sort = EXCLUDED.sort`;

/** Les choix de la planche, déjà ordonnés par couche : leur rang est leur position. */
function plancheStacks(): string {
  const rows = [...PLANCHE_STACKS].sort(
    (a, b) => LAYERS.indexOf(a.couche) - LAYERS.indexOf(b.couche) || (a.id < b.id ? -1 : 1),
  );
  return insert(
    "stack",
    "stack",
    `SELECT n::int AS n, data ->> 'id' AS spec_id,
            'tech/stack/' || substr(data ->> 'id', 4) || '.yaml' AS path, data, n::int AS sort
       FROM jsonb_array_elements(${literal(rows)}) WITH ORDINALITY AS rows(data, n)`,
  );
}

function largeStacks(count: number, components: number, requirements: number): string {
  const role = `CASE WHEN n = ${KNOWN_STACK_RANK} THEN '${KNOWN_STACK_ROLE}' ELSE 'Rôle technique ' || ${pad()} END`;
  const chosen = "n % 25 <> 0";
  const data = `jsonb_strip_nulls(jsonb_build_object(
      'id', 'ST-' || ${pad()}, 'couche', ${pick(LAYERS, "n % 5")}, 'role', ${role},
      'titre', (${role}) || ' : ' || CASE WHEN ${chosen} THEN 'Option A' ELSE 'à trancher' END,
      'statut', CASE WHEN ${chosen} THEN 'choisi' ELSE 'a_trancher' END,
      'choix', CASE WHEN ${chosen} THEN 'Option A' END, 'recommande', 'Option A',
      'composants', jsonb_build_array('C-composant-' || ${pad(`(1 + n % ${components})`)}),
      'options', jsonb_build_array('Option A', 'Option B'),
      'criteres', jsonb_build_array(jsonb_build_object('nom', 'Adéquation', 'valeurs', jsonb_build_array('Bonne', 'Moyenne'))),
      'pourquoi', 'Choix retenu pour le rôle ' || n || '.',
      'exigences', jsonb_build_array('NFR-' || ${pad(`(1 + n % ${requirements})`)}),
      'decisions', '[]'::jsonb))`;
  return insert(
    "stack",
    "stack",
    `SELECT n, 'ST-' || ${pad()} AS spec_id, 'tech/stack/' || ${pad()} || '.yaml' AS path,
            ${data} AS data, (n % 5) * 1000 + n AS sort
       FROM generate_series(1, ${count}) AS n`,
  );
}

const RESOURCES = [
  ["reservation", "Prise de rendez-vous"],
  ["creneau", "Prise de rendez-vous"],
  ["liste_attente", "Prise de rendez-vous"],
  ["horaire", "Prise de rendez-vous"],
  ["client", "Clients et fidélité"],
  ["avis", "Clients et fidélité"],
  ["fidelite", "Clients et fidélité"],
  ["segment", "Clients et fidélité"],
  ["service", "Catalogue et stock"],
  ["produit", "Catalogue et stock"],
  ["stock", "Catalogue et stock"],
  ["promo", "Catalogue et stock"],
  ["carte_cadeau", "Paiement et caisse"],
  ["paiement", "Paiement et caisse"],
  ["caisse", "Paiement et caisse"],
  ["facture", "Paiement et caisse"],
  ["personnel", "Personnel"],
  ["absence", "Personnel"],
  ["planning", "Personnel"],
  ["message", "Communication"],
  ["rappel", "Communication"],
  ["campagne", "Communication"],
] as const;
const VERBS = ["create", "update", "delete", "get", "list", "export"] as const;

function operations(count: number, components: number, rules: number, features: number): string {
  const resource = `((n - 1) / ${VERBS.length})`;
  const index = `${resource} % ${RESOURCES.length}`;
  const round = `${resource} / ${RESOURCES.length}`;
  const id = `${pick(
    RESOURCES.map(([name]) => name),
    index,
  )} || CASE WHEN ${round} > 0 THEN (${round})::text ELSE '' END || '.' || ${pick(VERBS, `(n - 1) % ${VERBS.length}`)}`;
  const data = `jsonb_build_object(
      'id', ${id}, 'titre', 'Opération ' || ${pad()}, 'resume', 'Opération ' || ${pad()},
      'type', CASE WHEN (n - 1) % ${VERBS.length} < 3 THEN 'ecriture' ELSE 'lecture' END,
      'zone', ${pick(
        RESOURCES.map(([, zone]) => zone),
        index,
      )},
      'composant', 'C-composant-' || ${pad(`(1 + n % ${components})`)}, 'permission', 'public',
      'entree', '{}'::jsonb, 'sortie', '{}'::jsonb, 'erreurs', '[]'::jsonb,
      'regles', jsonb_build_array('R-' || ${pad(`(1 + n % ${rules})`)}),
      'sert', jsonb_build_array('F-' || ${pad(`(1 + n % ${features})`)}))`;
  const rows = `SELECT n, ${id} AS spec_id, ${data} AS data FROM generate_series(1, ${count}) AS n`;
  // Rang du worker (B772) : zone puis nom, comparés octet par octet.
  const rank = `row_number() OVER (ORDER BY data ->> 'zone' COLLATE "C", spec_id COLLATE "C")`;
  return insert(
    "endpoint",
    "operation",
    `SELECT n, spec_id, 'api/endpoints/' || spec_id || '.yaml' AS path, data, (1000 + ${rank})::int AS sort
       FROM (${rows}) AS operations`,
  );
}

const CATEGORIES = [
  "donnees",
  "performance",
  "securite",
  "disponibilite",
  "accessibilite",
  "exploitation",
] as const;

function requirements(count: number, components: number): string {
  const data = `jsonb_build_object(
      'id', 'NFR-' || ${pad()}, 'titre', 'Exigence ' || ${pad()},
      'categorie', ${pick(CATEGORIES, `(n - 1) % ${CATEGORIES.length}`)},
      'cible', 'p95 < ' || (200 + n) || ' ms', 'enonce', 'Énoncé de l''exigence ' || n || '.',
      'verification', jsonb_build_object('mode', 'a_definir'),
      'liens', jsonb_build_array('C-composant-' || ${pad(`(1 + n % ${components})`)}))`;
  // Rang du worker (B772) : catégorie (ordre de la maquette) puis numéro.
  const rank = `row_number() OVER (ORDER BY (n - 1) % ${CATEGORIES.length}, n)`;
  return insert(
    "nfr",
    "nfr",
    `SELECT n, 'NFR-' || ${pad()} AS spec_id, 'nfr/NFR-' || ${pad()} || '.yaml' AS path, ${data} AS data,
            (${rank})::int AS sort
       FROM generate_series(1, ${count}) AS n`,
  );
}

const environment = (
  [id, nom, adresse, hebergement, base]: readonly string[],
  extra: Record<string, unknown>,
) => ({ id: `ENV-${id}`, nom, adresse, hebergement, base, ...extra });

/** Les trois environnements, les variables (noms seulement) et les intégrations de la maquette 14. */
const ENVIRONMENTS = {
  titre: "Environnements",
  environnements: [
    environment(
      [
        "developpement",
        "Développement",
        "localhost:3000",
        "Poste du développeur",
        "PostgreSQL local (conteneur)",
      ],
      {
        donnees: "jeux_exemple",
        acces: "Équipe",
        lignes: [{ libelle: "SMS", valeur: "Simulés (journal)" }],
      },
    ),
    environment(
      [
        "recette",
        "Recette",
        "recette.exemple.fr",
        "Scaleway · Paris",
        "PostgreSQL géré · petite instance",
      ],
      {
        donnees: "copie_anonymisee",
        deploiement: "fusion",
        acces: "Équipe + client",
        lignes: [{ libelle: "SMS", valeur: "Numéros de test" }],
      },
    ),
    environment(
      [
        "production",
        "Production",
        "reservation.exemple.fr",
        "Scaleway · Paris",
        "PostgreSQL géré · haute disponibilité",
      ],
      {
        donnees: "reelles",
        deploiement: "validation",
        acces: "Public · équipe connectée",
        lignes: [{ libelle: "SMS", valeur: "Réels · fournisseur à trancher" }],
      },
    ),
  ],
  variables: [
    { nom: "DATABASE_URL", usage: "Connexion à la base" },
    { nom: "AUTH_SECRET", usage: "Signature des sessions" },
    { nom: "SMS_API_KEY", usage: "Fournisseur SMS" },
    { nom: "MAIL_API_KEY", usage: "Fournisseur e-mail" },
    { nom: "SENTRY_DSN", usage: "Erreurs" },
  ],
  integrations: [
    { service: "Fournisseur SMS", usage: "Rappels", statut: "a_trancher" },
    { service: "Fournisseur e-mail", usage: "Liens de connexion", statut: "compte_a_creer" },
    { service: "Sentry", usage: "Erreurs et alertes", statut: "configure" },
    { service: "GitHub", usage: "Dépôt de code et CI", statut: "connecte" },
  ],
};

const environments = (): string =>
  insert(
    "environments",
    "environments",
    `SELECT 1 AS n, 'environments' AS spec_id, 'tech/environments.yaml' AS path,
            ${literal(ENVIRONMENTS)} AS data, 1 AS sort`,
  );

/** Le trigger interdit toute baisse d'un compteur : GREATEST le garde monotone. */
const nfrCounter = (count: number): string =>
  `INSERT INTO project_counters (organization_id, project_id, name, last_value, created_at, updated_at)
   VALUES ($2, $1::uuid, 'nfr', ${count}, ${AT}, ${AT})
   ON CONFLICT (project_id, name) DO UPDATE SET last_value = GREATEST(project_counters.last_value, EXCLUDED.last_value)`;

export function technicalStatements(profile: VolumeProfile, target: VolumeTarget): SeedStatement[] {
  const volume = SEED_VOLUMES[profile];
  const sql = [
    profile === "planche"
      ? plancheStacks()
      : largeStacks(volume.stacks, volume.components, volume.nfrs),
    operations(volume.operations, volume.components, volume.rules, volume.features),
    requirements(volume.nfrs, volume.components),
    environments(),
    nfrCounter(volume.nfrs),
  ];
  return sql.map((statement) => statementOf(statement, target));
}
