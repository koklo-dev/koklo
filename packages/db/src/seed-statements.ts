import {
  criterionSeedId,
  SEED_DATE,
  SEED_IDS,
  SEED_SPRINT,
  SEED_TICKETS,
  type SeedTicket,
  ticketSeedId,
} from "./seed-data.ts";

export interface SeedStatement {
  sql: string;
  params: unknown[];
}

const ORG = SEED_IDS.organization;
const PROJECT = SEED_IDS.project;

/**
 * Upsert générique : `table(columns) VALUES ($1..$n) ON CONFLICT (target) DO UPDATE`.
 * `created_at` et `updated_at` valent `SEED_DATE` (jamais d'horloge) ; `extraSet` remplace
 * l'affectation par défaut d'une colonne (ex. `GREATEST` pour un compteur monotone).
 */
function upsert(
  table: string,
  conflict: string,
  values: Record<string, unknown>,
  extraSet: Record<string, string> = {},
): SeedStatement {
  const columns = [...Object.keys(values), "created_at", "updated_at"];
  const params = [...Object.values(values), SEED_DATE];
  // created_at et updated_at partagent le dernier paramètre (SEED_DATE).
  const placeholders = columns.map((_, i) => `$${Math.min(i + 1, params.length)}`);
  const conflictColumns = conflict.split(",").map((c) => c.trim());
  const assignments = columns
    .filter((c) => !conflictColumns.includes(c))
    .map((c) => `${c} = ${extraSet[c] ?? `EXCLUDED.${c}`}`);
  return {
    sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})
          ON CONFLICT (${conflict}) DO UPDATE SET ${assignments.join(", ")}`,
    params,
  };
}

function baseStatements(): SeedStatement[] {
  const users = [
    [SEED_IDS.adminUser, "Alice Admin", "admin@demo.koklo.test"],
    [SEED_IDS.clientUser, "Claire Cliente", "client@demo.koklo.test"],
  ] as const;
  const members = [
    [SEED_IDS.adminMember, SEED_IDS.adminUser, "admin"],
    [SEED_IDS.clientMember, SEED_IDS.clientUser, "client"],
  ] as const;
  return [
    upsert("organizations", "id", {
      id: ORG,
      name: "Organisation de démo",
      slug: "demo",
    }),
    ...users.map(([id, name, email]) =>
      upsert("users", "id", { id, name, email, email_verified: true }),
    ),
    ...members.map(([id, userId, role]) =>
      upsert("members", "id", { id, organization_id: ORG, user_id: userId, role }),
    ),
    upsert("projects", "id", { id: PROJECT, organization_id: ORG, name: "Projet de démo" }),
  ];
}

function sprintStatement(): SeedStatement {
  return upsert("sprints", "project_id, number", {
    id: SEED_IDS.sprint,
    organization_id: ORG,
    project_id: PROJECT,
    number: SEED_SPRINT.number,
    key: SEED_SPRINT.key,
    goal: SEED_SPRINT.goal,
    starts_on: SEED_SPRINT.startsOn,
    ends_on: SEED_SPRINT.endsOn,
    status: SEED_SPRINT.status,
    definition_of_done: SEED_SPRINT.definitionOfDone,
  });
}

function ticketStatement(t: SeedTicket): SeedStatement {
  return upsert("tickets", "project_id, key", {
    id: ticketSeedId(t.number),
    organization_id: ORG,
    project_id: PROJECT,
    key: `TK-${t.number}`,
    title: t.title,
    description: t.description,
    type: t.type,
    status: t.status,
    priority: t.priority,
    sprint_id: SEED_IDS.sprint,
    pkg: t.pkg,
    sensitivity: t.sensitivity,
    estimate_hours: t.estimateHours,
    branch: t.branch,
    pull_request: t.pullRequest,
    attempts: 0,
    review_rounds: t.reviewRounds,
    deleted_at: null,
  });
}

/** Retire les enfants des seuls tickets seedés : le résultat ne dépend pas de l'état antérieur. */
function clearChildrenStatements(): SeedStatement[] {
  const ids = SEED_TICKETS.map((t) => ticketSeedId(t.number));
  return ["ticket_labels", "ticket_features", "ticket_dependencies", "acceptance_criteria"].map(
    (table) => ({ sql: `DELETE FROM ${table} WHERE ticket_id = ANY($1::uuid[])`, params: [ids] }),
  );
}

const insertChild = (table: string, values: Record<string, unknown>): SeedStatement => {
  const columns = Object.keys(values);
  return {
    sql: `INSERT INTO ${table} (${columns.join(", ")})
          VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})`,
    params: Object.values(values),
  };
};

function childStatements(t: SeedTicket): SeedStatement[] {
  const ticket_id = ticketSeedId(t.number);
  const scope = { organization_id: ORG, ticket_id };
  const status = t.status === "done" ? "proven" : "pending";
  const dependencies = [
    ...t.blockedBy.map((n) => [n, "blocks"] as const),
    ...t.related.map((n) => [n, "related"] as const),
  ];
  return [
    ...[`pkg:${t.pkg}`, "safe"].map((label) => insertChild("ticket_labels", { ...scope, label })),
    ...t.features.map((feature_ref) => insertChild("ticket_features", { ...scope, feature_ref })),
    ...dependencies.map(([n, type]) =>
      insertChild("ticket_dependencies", { ...scope, depends_on_id: ticketSeedId(n), type }),
    ),
    ...t.criteria.map((c, index) =>
      upsert("acceptance_criteria", "ticket_id, position", {
        id: criterionSeedId(t.number, index + 1),
        ...scope,
        position: index + 1,
        statement: c.statement,
        spec_ref: c.specRef,
        proof_status: status,
      }),
    ),
  ];
}

/** Compteurs alignés sur le jeu seedé ; `GREATEST` car le trigger interdit toute baisse. */
function counterStatements(): SeedStatement[] {
  const greatest = { last_value: "GREATEST(project_counters.last_value, EXCLUDED.last_value)" };
  return [
    ["ticket", SEED_TICKETS.length],
    ["sprint", SEED_SPRINT.number],
  ].map(([name, lastValue]) =>
    upsert(
      "project_counters",
      "project_id, name",
      { organization_id: ORG, project_id: PROJECT, name, last_value: lastValue },
      greatest,
    ),
  );
}

/**
 * Construit, dans l'ordre des clés étrangères, tous les statements du jeu de démo.
 * Pure et déterministe : aucune horloge, aucun aléa, mêmes paramètres à chaque appel.
 */
export function buildSeedStatements(): readonly SeedStatement[] {
  return [
    ...baseStatements(),
    sprintStatement(),
    ...SEED_TICKETS.map(ticketStatement),
    ...clearChildrenStatements(),
    ...SEED_TICKETS.flatMap(childStatements),
    ...counterStatements(),
  ];
}
