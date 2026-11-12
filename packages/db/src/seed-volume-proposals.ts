import { SEED_IDS } from "./seed-data.ts";
import type { SeedStatement } from "./seed-statements.ts";
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

type Kind = "feature" | "criteria" | "rule" | "role" | "flow";
type RuleType = "contrainte" | "calcul" | "workflow";
/** Un groupe de propositions consécutives : même type, même zone (`ruleType` : type des règles du groupe). */
interface Segment {
  kind: Kind;
  zone: string;
  count: number;
  ruleType?: RuleType;
}

const segment = (kind: Kind, zone: string, count: number, ruleType?: RuleType): Segment => ({
  kind,
  zone,
  count,
  ...(ruleType ? { ruleType } : {}),
});

/**
 * Jeu de charge : 120 + 140 + 140, toutes au-delà du seuil de 30 qui déclenche le groupement. Planche (TK-105, B365) :
 * les 248 fonctionnalités en 6 zones, les 86 règles en 3 zones (une par type), les 3 rôles et les 18 parcours relus.
 */
export const PROPOSAL_SEGMENTS: Record<VolumeProfile, readonly Segment[]> = {
  large: [
    segment("feature", "Réservations", 120),
    segment("feature", "Paiements", 140),
    segment("criteria", "Facturation", 140),
  ],
  planche: [
    segment("feature", "Réservation", 60),
    segment("feature", "Clients", 45),
    segment("feature", "Catalogue", 45),
    segment("feature", "Paiement", 40),
    segment("feature", "Personnel", 30),
    segment("feature", "Notifications", 28),
    segment("rule", "Contraintes", 30, "contrainte"),
    segment("rule", "Calculs", 28, "calcul"),
    segment("rule", "Workflows à états", 28, "workflow"),
    segment("role", "Rôles et permissions", 3),
    segment("flow", "Parcours", 18),
  ],
};

const STEPS = `jsonb_build_array(
  jsonb_build_object('type', 'etant_donne', 'text', 'un client connecté'),
  jsonb_build_object('type', 'quand', 'text', 'il ouvre la page'),
  jsonb_build_object('type', 'alors', 'text', 'il voit le résultat'))`;
const CRITERION = `jsonb_build_array(jsonb_build_object('title', 'Affichage du résultat', 'steps', ${STEPS}))`;
const ROLE_NAMES = ["Responsable d'agence", "Comptable", "Conseiller clientèle"] as const;

/** `CASE` sur le rang `n` : la valeur du groupe qui contient la proposition. */
function byRank(segments: readonly Segment[], value: (s: Segment, first: number) => string | null) {
  let last = 0;
  const branches = segments.flatMap((s) => {
    const first = last + 1;
    last += s.count;
    const text = value(s, first);
    return text === null ? [] : [`WHEN n <= ${last} THEN ${text}`];
  });
  return branches.length === 0 ? "NULL" : `CASE ${branches.join(" ")} END`;
}
const quoted = (text: string) => `'${text.replace(/'/g, "''")}'`;

/** Charge de la proposition selon son type, dans la forme que `operationOf` (web) relit. */
function payloadOf(segments: readonly Segment[], title: string): string {
  const ruleType = byRank(segments, (s) => (s.ruleType ? quoted(s.ruleType) : null));
  const roleRank = `(n - ${firstOf(segments, "role")})`;
  const feature = `jsonb_build_object('title', ${title}, 'priority', 'should', 'description', 'Jeu de volume', 'criteria', ${CRITERION})`;
  const criteria = `jsonb_build_object('specId', 'F-' || ${pad(`(n - ${firstOf(segments, "criteria") - 1})`)}, 'criteria', ${CRITERION})`;
  const rule = `jsonb_build_object('title', ${title}, 'type', ${ruleType}, 'statement', 'Énoncé de la règle proposée ' || n || '.')
      || CASE WHEN ${ruleType} = 'workflow' THEN jsonb_build_object('states', jsonb_build_array('Brouillon', 'Validée')) ELSE '{}'::jsonb END`;
  const role = `jsonb_build_object('name', ${pick(ROLE_NAMES, `${roleRank} % 3`)}, 'description', 'Rôle proposé par l''agent',
      'permissions', jsonb_build_array(jsonb_build_object('id', 'PM-agenda.lire')))`;
  const flow = `jsonb_build_object('title', ${title}, 'actor', 'Client',
      'steps', jsonb_build_array('Ouvrir l''accueil', 'Choisir une prestation', 'Confirmer'))`;
  return `CASE WHEN ${isKind(segments, "criteria")} THEN ${criteria} WHEN ${isKind(segments, "rule")} THEN ${rule}
    WHEN ${isKind(segments, "role")} THEN ${role} WHEN ${isKind(segments, "flow")} THEN ${flow} ELSE ${feature} END`;
}
const firstOf = (segments: readonly Segment[], kind: Kind): number => {
  let last = 0;
  for (const s of segments) {
    if (s.kind === kind) return last + 1;
    last += s.count;
  }
  return 0;
};
const isKind = (segments: readonly Segment[], kind: Kind): string => {
  const first = firstOf(segments, kind);
  if (first === 0) return "false";
  const count = segments.filter((s) => s.kind === kind).reduce((sum, s) => sum + s.count, 0);
  return `n BETWEEN ${first} AND ${first + count - 1}`;
};

/**
 * Lancement terminé et propositions de l'agent (TK-99a, TK-105) : 70 % en attente, 20 % acceptées, 10 % refusées.
 * Les charges respectent les schémas par type.
 */
export function proposalStatements(profile: VolumeProfile, target: VolumeTarget): SeedStatement[] {
  const segments = PROPOSAL_SEGMENTS[profile];
  const total = SEED_VOLUMES[profile].proposals;
  if (total === 0) return [];
  const at = "$3::timestamptz";
  const title = `${pick(VERBS, "n % 9")} || ' ' || ${pick(NOUNS, "(n / 9) % 10")} || ' (proposition ' || n || ')'`;
  const kind = byRank(segments, (s) => quoted(s.kind));
  const zone = byRank(segments, (s) => quoted(s.zone));
  const sql = [
    `INSERT INTO agent_launches (id, organization_id, project_id, deliverable, mode, status, requested_by, sources,
        proposed_count, discarded_count, heartbeat_at, last_seen_at, started_at, finished_at, created_at, updated_at)
     VALUES (${own("launch")}, $2, $1::uuid, 'functional', 'complete', 'done', '${SEED_IDS.adminUser}',
        '["idea.frozen", "idea.synthesis", "idea.risks", "functional.current"]'::jsonb, ${total}, 0, ${at}, ${at}, ${at}, ${at}, ${at}, ${at})
     ON CONFLICT (id) DO UPDATE SET proposed_count = EXCLUDED.proposed_count`,
    `INSERT INTO agent_proposals (id, organization_id, project_id, launch_id, deliverable, kind, zone, position, title,
        rationale, payload, status, created_at, updated_at)
     SELECT ${nth("proposal")}, $2, $1::uuid, ${own("launch")}, 'functional', ${kind}, ${zone}, n, ${title},
            'Absent du cahier actuel', ${payloadOf(segments, title)},
            CASE WHEN n % 10 < 2 THEN 'accepted' WHEN n % 10 = 2 THEN 'rejected' ELSE 'pending' END, ${at}, ${at}
       FROM generate_series(1, ${total}) AS n
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, payload = EXCLUDED.payload`,
  ];
  return sql.map((statement) => statementOf(statement, target));
}
