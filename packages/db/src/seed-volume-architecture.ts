import { SEED_IDS } from "./seed-data.ts";
import type { SeedStatement } from "./seed-statements.ts";
import { nth, own, pad, pick, statementOf, type VolumeTarget } from "./seed-volume-sql.ts";
import { SEED_VOLUMES, type VolumeProfile } from "./seed-volumes.ts";

/**
 * Composants d'architecture et propositions de l'agent des jeux de volume (TK-111, B515). `large` : huit zones tournantes,
 * 120 composants. `planche` : les six zones de la planche « Volume réel » (9, 4, 6, 7, 3 et 5 composants, dans l'ordre de la
 * maquette 13, soit 34), puis 80 propositions d'architecture (34 composants, 18 flux, 12 décisions, 16 sections du document).
 * Tout est déterministe : aucune horloge, aucun aléa.
 */
const LARGE_ZONES = [
  "Interfaces",
  "Noyau métier",
  "Données",
  "Intégrations",
  "Messagerie",
  "Sécurité",
  "Exploitation",
  "Outils",
] as const;

const PLANCHE_ZONES = [
  { name: "Prise de rendez-vous", size: 9 },
  { name: "Clients et fidélité", size: 4 },
  { name: "Catalogue et stock", size: 6 },
  { name: "Paiement et caisse", size: 7 },
  { name: "Personnel", size: 3 },
  { name: "Communication", size: 5 },
] as const;

const TYPES = ["service", "app", "store", "queue", "ext"] as const;

/** Rang (à partir de 1) de la première composante de chaque zone de la planche. */
const STARTS = PLANCHE_ZONES.map((_, index) =>
  PLANCHE_ZONES.slice(0, index).reduce((sum, zone) => sum + zone.size, 1),
);

const zoneSql = (profile: VolumeProfile): string => {
  if (profile === "large") return pick(LARGE_ZONES, "n % 8");
  const branches = PLANCHE_ZONES.map((zone, index) => {
    const end = (STARTS[index] as number) + zone.size - 1;
    return `WHEN n <= ${end} THEN '${zone.name}'`;
  });
  return `(CASE ${branches.join(" ")} END)`;
};

/** Vrai pour un composant qui dépend du précédent (`large` : tous sauf le premier ; `planche` : dans sa zone seulement). */
const chainedSql = (profile: VolumeProfile): string =>
  profile === "large" ? "n > 1" : `n NOT IN (${STARTS.join(", ")})`;

/**
 * Contenu d'un composant (TK-111, B515) : `titre` = nom, type tournant, zone, responsabilité, une fonctionnalité servie, une
 * table possédée sur les premiers rangs, une dépendance vers le précédent de la zone (asynchrone un rang sur trois : la chaîne
 * n'est jamais circulaire). Les identifiants cités existent tous dans le jeu.
 */
export const componentData = (profile: VolumeProfile, features: number, tables: number): string => {
  const previous = pad("(n - 1)");
  return `jsonb_build_object(
    'id', 'C-composant-' || ${pad()}, 'titre', 'Composant ' || ${pad()}, 'nom', 'Composant ' || ${pad()},
    'type', ${pick(TYPES, "n % 5")}, 'zone', ${zoneSql(profile)},
    'responsabilite', 'Responsabilité du composant ' || ${pad()} || '.',
    'possede', CASE WHEN n <= ${tables} AND n % 5 <> 4 THEN jsonb_build_array('T-table-' || ${pad()}) ELSE '[]'::jsonb END,
    'sert', jsonb_build_array('F-' || ${pad(`(1 + n % ${features})`)}),
    'depend_de', CASE WHEN ${chainedSql(profile)}
      THEN jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('vers', 'C-composant-' || ${previous}, 'via', 'HTTP',
        'mode', CASE WHEN n % 3 = 0 THEN 'asynchrone' END)))
      ELSE '[]'::jsonb END,
    'decisions', '[]'::jsonb)`;
};

type Kind = "component" | "archflow" | "adr" | "doc_section";
interface Segment {
  kind: Kind;
  zone: string;
  count: number;
}

/** Les 80 propositions de la planche, groupées par type (la relecture de l'architecture se groupe par type, jamais par zone). */
export const ARCHITECTURE_PROPOSAL_SEGMENTS: Record<VolumeProfile, readonly Segment[]> = {
  large: [],
  planche: [
    { kind: "component", zone: "Prise de rendez-vous", count: 34 },
    { kind: "archflow", zone: "Prise de rendez-vous", count: 18 },
    { kind: "adr", zone: "Prise de rendez-vous", count: 12 },
    { kind: "doc_section", zone: "Prise de rendez-vous", count: 16 },
  ],
};

const quoted = (text: string) => `'${text.replace(/'/g, "''")}'`;

/** `CASE` sur le rang `n` : la valeur du segment qui contient la proposition. */
function byRank(segments: readonly Segment[], value: (s: Segment, first: number) => string) {
  let last = 0;
  const branches = segments.map((s) => {
    const first = last + 1;
    last += s.count;
    return `WHEN n <= ${last} THEN ${value(s, first)}`;
  });
  return `CASE ${branches.join(" ")} END`;
}

const firstOf = (segments: readonly Segment[], kind: Kind): number => {
  let last = 0;
  for (const s of segments) {
    if (s.kind === kind) return last + 1;
    last += s.count;
  }
  return 0;
};

/** Charge d'une proposition selon son type, dans la forme que les schémas de proposition (`@koklo/schema`) acceptent. */
function payloadOf(segments: readonly Segment[]): string {
  const rank = (kind: Kind) => `(n - ${firstOf(segments, kind) - 1})`;
  const component = `jsonb_build_object('name', 'Composant proposé ' || ${pad(rank("component"))}, 'type', ${pick(TYPES, `${rank("component")} % 5`)},
      'zone', 'Prise de rendez-vous', 'responsibility', 'Responsabilité proposée par l''agent.',
      'serves', jsonb_build_array('F-' || ${pad(`(1 + ${rank("component")} % 10)`)}))`;
  const flow = `jsonb_build_object('flow', 'P-parcours-' || ${pad(rank("archflow"))},
      'participants', jsonb_build_array('C-composant-001', 'C-composant-002'),
      'messages', jsonb_build_array(jsonb_build_object('from', 'C-composant-001', 'to', 'C-composant-002', 'text', 'Appelle', 'reply', 'Répond')))`;
  const adr = `jsonb_build_object('title', 'Décision proposée ' || ${pad(rank("adr"))}, 'context', 'Contexte de la décision.',
      'decision', 'Décision retenue.', 'alternatives', jsonb_build_array(jsonb_build_object('name', 'Autre option', 'reason', 'Moins adaptée.')))`;
  const section = `jsonb_build_object('title', 'Section proposée ' || ${pad(rank("doc_section"))}, 'markdown', 'Texte de la section proposée.')`;
  const isKind = (kind: Kind) => {
    const first = firstOf(segments, kind);
    const count = segments.filter((s) => s.kind === kind).reduce((sum, s) => sum + s.count, 0);
    return first === 0 ? "false" : `n BETWEEN ${first} AND ${first + count - 1}`;
  };
  return `CASE WHEN ${isKind("archflow")} THEN ${flow} WHEN ${isKind("adr")} THEN ${adr}
    WHEN ${isKind("doc_section")} THEN ${section} ELSE ${component} END`;
}

/** Titre d'une proposition : le nom du composant, le parcours du flux, le titre de la décision ou de la section. */
const titleOf = (payload: string): string =>
  `COALESCE((${payload}) ->> 'name', (${payload}) ->> 'flow', (${payload}) ->> 'title')`;

/**
 * Lancement terminé de l'architecture et propositions de l'agent (TK-111, B515) : 70 % en attente, 20 % acceptées, 10 % refusées.
 * `large` n'en porte aucune.
 */
export function architectureProposalStatements(
  profile: VolumeProfile,
  target: VolumeTarget,
): SeedStatement[] {
  const segments = ARCHITECTURE_PROPOSAL_SEGMENTS[profile];
  const total = SEED_VOLUMES[profile].architectureProposals;
  if (total === 0) return [];
  const at = "$3::timestamptz";
  const payload = payloadOf(segments);
  const kind = byRank(segments, (s) => quoted(s.kind));
  const zone = byRank(segments, (s) => quoted(s.zone));
  const sql = [
    `INSERT INTO agent_launches (id, organization_id, project_id, deliverable, mode, status, requested_by, sources,
        proposed_count, discarded_count, heartbeat_at, last_seen_at, started_at, finished_at, created_at, updated_at)
     VALUES (${own("launch-architecture")}, $2, $1::uuid, 'architecture', 'all', 'done', '${SEED_IDS.adminUser}',
        '["functional.features", "functional.rules", "functional.roles", "functional.flows", "data.tables", "architecture.current", "nfr.known"]'::jsonb,
        ${total}, 0, ${at}, ${at}, ${at}, ${at}, ${at}, ${at})
     ON CONFLICT (id) DO UPDATE SET proposed_count = EXCLUDED.proposed_count`,
    `INSERT INTO agent_proposals (id, organization_id, project_id, launch_id, deliverable, kind, zone, position, title,
        rationale, payload, status, created_at, updated_at)
     SELECT ${nth("proposal-architecture")}, $2, $1::uuid, ${own("launch-architecture")}, 'architecture', ${kind}, ${zone}, n,
            ${titleOf(payload)}, 'Absent de l''architecture actuelle', ${payload},
            CASE WHEN n % 10 < 2 THEN 'accepted' WHEN n % 10 = 2 THEN 'rejected' ELSE 'pending' END, ${at}, ${at}
       FROM generate_series(1, ${total}) AS n
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, payload = EXCLUDED.payload, title = EXCLUDED.title`,
  ];
  return sql.map((statement) => statementOf(statement, target));
}
