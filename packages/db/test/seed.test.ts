import {
  addDependency,
  assertUniqueKeys,
  createDependencyGraph,
  type Dependency,
  parseTicketKey,
  TICKET_PACKAGES,
  TICKET_STATUSES,
} from "@koklo/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED_IDS, seed } from "../src/seed.ts";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";

const TABLES = [
  "users",
  "organizations",
  "members",
  "projects",
  "sprints",
  "tickets",
  "ticket_labels",
  "ticket_features",
  "acceptance_criteria",
  "ticket_dependencies",
  "project_counters",
] as const;

type Snapshot = Record<(typeof TABLES)[number], unknown[]>;

/** Ordre total par clé naturelle / PK : les tables sans colonne `id` n'ont pas d'ORDER BY id. */
const ORDER_BY: Record<(typeof TABLES)[number], string> = {
  users: "id",
  organizations: "id",
  members: "id",
  projects: "id",
  sprints: "id",
  tickets: "id",
  ticket_labels: "ticket_id, label",
  ticket_features: "ticket_id, feature_ref",
  acceptance_criteria: "id",
  ticket_dependencies: "ticket_id, depends_on_id, type",
  project_counters: "project_id, name",
};

async function snapshot(db: TestDatabase): Promise<Snapshot> {
  const result: Partial<Snapshot> = {};
  for (const table of TABLES) {
    result[table] = await db.query(`SELECT * FROM ${table} ORDER BY ${ORDER_BY[table]}`);
  }
  return result as Snapshot;
}

/** Migre la base puis exécute le seed deux fois, en photographiant l'état après chaque passage. */
async function seedTwice(db: TestDatabase): Promise<[Snapshot, Snapshot]> {
  runPrismaOrThrow(["migrate", "deploy"], db.url);
  await seed(db.url);
  const first = await snapshot(db);
  await seed(db.url);
  return [first, await snapshot(db)];
}

describe("seed déterministe (TK-8)", () => {
  let db: TestDatabase;
  let first: Snapshot;
  let second: Snapshot;

  beforeAll(async () => {
    db = await createTestDatabase();
    [first, second] = await seedTwice(db);
  }, 180_000);

  afterAll(async () => {
    await db?.dispose();
  });

  it("produit exactement la même base après deux exécutions successives", () => {
    expect(second).toEqual(first);
  });

  it("crée une seule organisation de démo aux identifiants fixes", () => {
    expect(second.organizations).toHaveLength(1);
    expect(second.organizations[0]).toMatchObject({ id: SEED_IDS.organization });
  });

  it("crée deux utilisateurs aux identifiants fixes", () => {
    const ids = (second.users as { id: string }[]).map((row) => row.id).sort();

    expect(ids).toEqual([SEED_IDS.adminUser, SEED_IDS.clientUser].sort());
  });

  it("crée deux membres : un admin et un client, rattachés à l'organisation", () => {
    const members = second.members as {
      id: string;
      role: string;
      user_id: string;
      organization_id: string;
    }[];

    expect(members).toHaveLength(2);
    expect(members.map((m) => m.organization_id)).toEqual([
      SEED_IDS.organization,
      SEED_IDS.organization,
    ]);
    const byRole = Object.fromEntries(members.map((m) => [m.role, m]));
    expect(Object.keys(byRole).sort()).toEqual(["admin", "client"]);
    expect(byRole.admin).toMatchObject({ id: SEED_IDS.adminMember, user_id: SEED_IDS.adminUser });
    expect(byRole.client).toMatchObject({
      id: SEED_IDS.clientMember,
      user_id: SEED_IDS.clientUser,
    });
  });

  it("crée un projet rattaché à l'organisation de démo", () => {
    expect(second.projects).toHaveLength(1);
    expect(second.projects[0]).toMatchObject({
      id: SEED_IDS.project,
      organization_id: SEED_IDS.organization,
    });
  });
});

// ---------------------------------------------------------------------------------------------
// TK-33 : seed complet du §18.3 (sprint, 6 tickets, dépendances, critères, compteurs, garde-fou).
// Chaque describe tient en moins de 50 lignes (règle de lint) et partage une base seedée.
// ---------------------------------------------------------------------------------------------

const DEMO_PROJECT = SEED_IDS.project;
const DEMO_ORG = SEED_IDS.organization;
/** Ids réservés (analyse §4) : sprint `…a1`, tickets `…0000000001NN`. */
const SPRINT_ID = "01900000-0000-7000-8000-0000000000a1";
const ticketId = (n: number): string =>
  `01900000-0000-7000-8000-0000000001${n.toString(16).padStart(2, "0")}`;

type Row = Record<string, unknown>;
const rowsOf = (snap: Snapshot, table: (typeof TABLES)[number]): Row[] => snap[table] as Row[];

/** Contrat attendu (analyse §2) : écrit ici en dur, indépendamment du code de production. */
const EXPECTED_TICKETS = [
  { key: "TK-1", pkg: "db", status: "done", features: ["F-001"] },
  { key: "TK-2", pkg: "domain", status: "done", features: ["F-001"] },
  { key: "TK-3", pkg: "api", status: "in_review", features: ["F-001"] },
  { key: "TK-4", pkg: "api", status: "in_progress", features: ["F-002"] },
  { key: "TK-5", pkg: "web", status: "todo", features: ["F-001"] },
  { key: "TK-6", pkg: "e2e", status: "backlog", features: ["F-001", "F-002"] },
] as const;

const EXPECTED_EDGES: readonly Dependency[] = [
  { ticket: "TK-3", dependsOn: "TK-1", type: "blocks" },
  { ticket: "TK-3", dependsOn: "TK-2", type: "blocks" },
  { ticket: "TK-4", dependsOn: "TK-1", type: "blocks" },
  { ticket: "TK-5", dependsOn: "TK-3", type: "blocks" },
  { ticket: "TK-6", dependsOn: "TK-3", type: "blocks" },
  { ticket: "TK-6", dependsOn: "TK-4", type: "blocks" },
  { ticket: "TK-6", dependsOn: "TK-5", type: "blocks" },
  { ticket: "TK-4", dependsOn: "TK-2", type: "related" },
];

async function migratedDb(): Promise<TestDatabase> {
  const db = await createTestDatabase();
  try {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
  } catch (error) {
    await db.dispose();
    throw error;
  }
  return db;
}

interface Seeded {
  db: TestDatabase;
  snap: Snapshot;
}

/** Enregistre beforeAll/afterAll : une base migrée, seedée une fois, photographiée. */
function useSeededDb(): () => Seeded {
  let state: Seeded | undefined;
  beforeAll(async () => {
    const db = await migratedDb();
    await seed(db.url);
    state = { db, snap: await snapshot(db) };
  }, 180_000);
  afterAll(async () => {
    await state?.db.dispose();
  });
  return () => state as Seeded;
}

function edgesOf(snap: Snapshot): Dependency[] {
  const keys = new Map(rowsOf(snap, "tickets").map((t) => [t.id as string, t.key as string]));
  return rowsOf(snap, "ticket_dependencies").map((d) => ({
    ticket: keys.get(d.ticket_id as string) as string,
    dependsOn: keys.get(d.depends_on_id as string) as string,
    type: d.type as Dependency["type"],
  }));
}

const edgeId = (e: Dependency): string => `${e.ticket}>${e.dependsOn}:${e.type}`;

describe("seed complet : données historiques inchangées (TK-33, e2e)", () => {
  const ctx = useSeededDb();

  it("garde l'organisation, l'admin, le client et le projet de démo", () => {
    const { snap } = ctx();

    expect(rowsOf(snap, "organizations")).toHaveLength(1);
    expect(rowsOf(snap, "organizations")[0]).toMatchObject({
      id: DEMO_ORG,
      name: "Organisation de démo",
      slug: "demo",
    });
    const users = rowsOf(snap, "users").map((u) => `${u.id}|${u.name}|${u.email}`);
    expect(users.sort()).toEqual(
      [
        `${SEED_IDS.adminUser}|Alice Admin|admin@demo.koklo.test`,
        `${SEED_IDS.clientUser}|Claire Cliente|client@demo.koklo.test`,
      ].sort(),
    );
    expect(rowsOf(snap, "projects")).toHaveLength(1);
    expect(rowsOf(snap, "projects")[0]).toMatchObject({ id: DEMO_PROJECT, name: "Projet de démo" });
  });

  it("garde les six identifiants historiques", () => {
    expect(SEED_IDS).toMatchObject({
      organization: "01900000-0000-7000-8000-000000000001",
      adminUser: "01900000-0000-7000-8000-000000000002",
      clientUser: "01900000-0000-7000-8000-000000000003",
      adminMember: "01900000-0000-7000-8000-000000000004",
      clientMember: "01900000-0000-7000-8000-000000000005",
      project: "01900000-0000-7000-8000-000000000006",
    });
  });

  it("n'écrit aucun compte ni secret, ni bail, commentaire, audit ou état de projet", async () => {
    const { db } = ctx();

    for (const table of ["accounts", "leases", "ticket_comments", "audit_log", "project_states"]) {
      expect(await db.query(`SELECT 1 FROM ${table}`), table).toHaveLength(0);
    }
  });
});

describe("seed complet : sprint et tickets (TK-33)", () => {
  const ctx = useSeededDb();

  it("crée un unique sprint SP-1 actif dans le projet de démo", () => {
    const sprints = rowsOf(ctx().snap, "sprints");

    expect(sprints).toHaveLength(1);
    expect(sprints[0]).toMatchObject({
      id: SPRINT_ID,
      organization_id: DEMO_ORG,
      project_id: DEMO_PROJECT,
      number: 1,
      key: "SP-1",
      status: "active",
    });
    expect(String(sprints[0]?.goal).length).toBeGreaterThan(0);
    expect(String(sprints[0]?.definition_of_done).length).toBeGreaterThan(0);
  });

  it("crée exactement TK-1 à TK-6 aux ids fixes, statuts et paquets attendus, dans le sprint 1", () => {
    const tickets = rowsOf(ctx().snap, "tickets");

    expect(tickets.map((t) => t.key).sort()).toEqual(EXPECTED_TICKETS.map((t) => t.key));
    for (const [index, expected] of EXPECTED_TICKETS.entries()) {
      const row = tickets.find((t) => t.key === expected.key);
      expect(row, expected.key).toMatchObject({
        id: ticketId(index + 1),
        organization_id: DEMO_ORG,
        project_id: DEMO_PROJECT,
        sprint_id: SPRINT_ID,
        pkg: expected.pkg,
        status: expected.status,
      });
      expect(String(row?.title).length, expected.key).toBeGreaterThan(0);
      expect(row?.estimate_hours, expected.key).not.toBeNull();
      expect(row?.deleted_at, expected.key).toBeNull();
      expect(row?.assignee_id, expected.key).toBeNull();
    }
  });
});

describe("seed complet : métadonnées des tickets (TK-33)", () => {
  const ctx = useSeededDb();

  it("couvre plusieurs priorités et les deux sensibilités, TK-1 étant sensible", () => {
    const tickets = rowsOf(ctx().snap, "tickets");

    expect(new Set(tickets.map((t) => t.priority)).size).toBeGreaterThanOrEqual(3);
    const sensitive = tickets.filter((t) => t.sensitivity === "sensitive");
    expect(sensitive.map((t) => t.key)).toEqual(["TK-1"]);
    expect(tickets.filter((t) => t.sensitivity === "safe")).toHaveLength(5);
  });

  it("renseigne branche et PR fictives pour TK-3 seulement, avec un tour de revue", () => {
    const tickets = rowsOf(ctx().snap, "tickets");
    const tk3 = tickets.find((t) => t.key === "TK-3");

    expect(tk3?.review_rounds).toBe(1);
    expect(tk3?.branch).not.toBeNull();
    expect(tk3?.pull_request).not.toBeNull();
    for (const other of tickets.filter((t) => t.key !== "TK-3")) {
      expect(other.review_rounds, String(other.key)).toBe(0);
      expect(other.branch, String(other.key)).toBeNull();
      expect(other.pull_request, String(other.key)).toBeNull();
    }
    expect(tickets.every((t) => t.attempts === 0)).toBe(true);
  });
});

describe("seed complet : enfants des tickets (TK-33)", () => {
  const ctx = useSeededDb();

  it("pose pour chaque ticket le label pkg:<pkg> et le label safe", () => {
    const labels = rowsOf(ctx().snap, "ticket_labels");

    for (const [index, expected] of EXPECTED_TICKETS.entries()) {
      const own = labels.filter((l) => l.ticket_id === ticketId(index + 1)).map((l) => l.label);
      expect(own.sort(), expected.key).toEqual([`pkg:${expected.pkg}`, "safe"].sort());
    }
    expect(labels).toHaveLength(EXPECTED_TICKETS.length * 2);
  });

  it("rattache chaque ticket à ses features", () => {
    const features = rowsOf(ctx().snap, "ticket_features");

    for (const [index, expected] of EXPECTED_TICKETS.entries()) {
      const own = features.filter((f) => f.ticket_id === ticketId(index + 1));
      expect(own.map((f) => f.feature_ref).sort(), expected.key).toEqual([...expected.features]);
    }
  });

  it("crée les dépendances blocks attendues et l'arête related TK-4 -> TK-2", () => {
    expect(edgesOf(ctx().snap).map(edgeId).sort()).toEqual(EXPECTED_EDGES.map(edgeId).sort());
  });

  it("donne 1 à 2 critères par ticket, positions dès 1, preuve cohérente avec le statut", () => {
    const { snap } = ctx();
    const done = new Set(
      rowsOf(snap, "tickets")
        .filter((t) => t.status === "done")
        .map((t) => t.id),
    );

    for (const [index, expected] of EXPECTED_TICKETS.entries()) {
      const own = rowsOf(snap, "acceptance_criteria")
        .filter((c) => c.ticket_id === ticketId(index + 1))
        .sort((a, b) => (a.position as number) - (b.position as number));
      expect(own.length, expected.key).toBeGreaterThanOrEqual(1);
      expect(own.length, expected.key).toBeLessThanOrEqual(2);
      expect(
        own.map((c) => c.position),
        expected.key,
      ).toEqual(own.map((_, i) => i + 1));
      for (const c of own) {
        expect(c.proof_status, expected.key).toBe(done.has(c.ticket_id) ? "proven" : "pending");
      }
    }
  });

  it("aligne les compteurs : tickets = 6, sprints = 1 (le prochain ticket sera TK-7)", () => {
    const counters = rowsOf(ctx().snap, "project_counters");

    expect(counters).toHaveLength(2);
    const scope = { project_id: DEMO_PROJECT, organization_id: DEMO_ORG };
    expect(counters.find((c) => c.name === "ticket")).toMatchObject({ ...scope, last_value: 6 });
    expect(counters.find((c) => c.name === "sprint")).toMatchObject({ ...scope, last_value: 1 });
  });
});

describe("seed complet : cohérence avec @koklo/domain (TK-33)", () => {
  const ctx = useSeededDb();

  it("n'utilise que des clés TK-n valides et uniques", () => {
    const keys = rowsOf(ctx().snap, "tickets").map((t) => t.key as string);

    expect(() => assertUniqueKeys(keys)).not.toThrow();
    expect(keys.map(parseTicketKey).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("n'utilise que des statuts et des paquets connus du domaine", () => {
    const tickets = rowsOf(ctx().snap, "tickets");

    expect(tickets).toHaveLength(6);
    for (const t of tickets) {
      expect(TICKET_STATUSES).toContain(t.status);
      expect(TICKET_PACKAGES).toContain(t.pkg);
    }
  });

  it("forme un graphe de dépendances acyclique accepté par le domaine", () => {
    const edges = edgesOf(ctx().snap);
    const build = () => edges.reduce((g, edge) => addDependency(g, edge), createDependencyGraph());

    expect(edges.length).toBeGreaterThan(0);
    expect(build).not.toThrow();
  });

  it("porte organization_id = organisation de démo sur toutes les lignes métier", () => {
    const { snap } = ctx();
    const tables = TABLES.filter((t) => !["users", "organizations", "members"].includes(t));

    for (const table of tables) {
      const rows = rowsOf(snap, table);
      expect(rows.length, table).toBeGreaterThan(0);
      expect(
        rows.every((r) => r.organization_id === DEMO_ORG),
        table,
      ).toBe(true);
    }
  });
});

describe("seed complet : références vers DEMO_SPEC (TK-33)", () => {
  const ctx = useSeededDb();

  it("résout chaque feature_ref et chaque spec_ref dans DEMO_SPEC", async () => {
    const { DEMO_SPEC } = await import("../src/seed-data.ts");
    const { snap } = ctx();
    const featureIds = new Set(DEMO_SPEC.features.map((f) => f.id));
    const acs = new Map(
      DEMO_SPEC.features.map((f) => [f.id, new Set(f.acceptanceCriteria.map((c) => c.id))]),
    );
    const cols = new Map(
      DEMO_SPEC.tables.map((t) => [t.id, new Set(t.columns.map((c) => c.name))]),
    );

    for (const f of rowsOf(snap, "ticket_features")) {
      expect(featureIds.has(f.feature_ref as string), String(f.feature_ref)).toBe(true);
    }
    const refs = rowsOf(snap, "acceptance_criteria")
      .map((c) => c.spec_ref as string | null)
      .filter((ref): ref is string => ref !== null);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const [head = "", tail = ""] = ref.split(/[#.]/);
      const resolved = ref.includes("#") ? acs.get(head)?.has(tail) : cols.get(head)?.has(tail);
      expect(resolved, ref).toBe(true);
    }
  });

  it("DEMO_SPEC décrit F-001 à F-003 et T-user, T-session, liés entre eux", async () => {
    const { DEMO_SPEC } = await import("../src/seed-data.ts");

    expect(DEMO_SPEC.features.map((f) => [f.id, f.priority])).toEqual([
      ["F-001", "must"],
      ["F-002", "must"],
      ["F-003", "should"],
    ]);
    expect(DEMO_SPEC.tables.map((t) => t.id)).toEqual(["T-user", "T-session"]);
    expect(DEMO_SPEC.features.map((f) => [f.id, [...f.tables]])).toEqual([
      ["F-001", ["T-user"]],
      ["F-002", ["T-user", "T-session"]],
      ["F-003", ["T-user"]],
    ]);
    const columns = (i: number) => DEMO_SPEC.tables[i]?.columns.map((c) => c.name);
    expect(columns(0)).toEqual(expect.arrayContaining(["id", "email", "name", "created_at"]));
    expect(columns(1)).toEqual(expect.arrayContaining(["id", "user_id", "expires_at"]));
  });
});

describe("seed complet : statements déterministes (TK-33)", () => {
  it("construit deux fois les mêmes statements, sans horloge ni aléa", async () => {
    const { buildSeedStatements } = await import("../src/seed-statements.ts");

    const first = buildSeedStatements();

    expect(buildSeedStatements()).toEqual(first);
    expect(first.length).toBeGreaterThan(6);
    for (const { sql, params } of first) {
      expect(sql).not.toMatch(/now\(\)|uuidv7|gen_random_uuid|random\(\)|current_timestamp/i);
      expect(params.some((p) => p instanceof Date)).toBe(false);
    }
  });
});

describe("seed complet : double exécution (TK-33)", () => {
  let db: TestDatabase;
  let first: Snapshot;
  let second: Snapshot;

  beforeAll(async () => {
    db = await createTestDatabase();
    [first, second] = await seedTwice(db);
  }, 180_000);

  afterAll(async () => {
    await db?.dispose();
  });

  it("laisse un snapshot identique sur toutes les tables seedées", () => {
    for (const table of TABLES) {
      expect(second[table], table).toEqual(first[table]);
    }
  });

  it("ne crée aucun doublon (effectifs fixes)", () => {
    const counts = Object.fromEntries(TABLES.map((t) => [t, second[t].length]));

    expect(counts).toMatchObject({
      users: 2,
      organizations: 1,
      members: 2,
      projects: 1,
      sprints: 1,
      tickets: 6,
      ticket_labels: 12,
      ticket_features: 7,
      ticket_dependencies: 8,
      project_counters: 2,
    });
    expect(counts.acceptance_criteria).toBeGreaterThanOrEqual(6);
    expect(counts.acceptance_criteria).toBeLessThanOrEqual(12);
  });
});

const OUTSIDE_ID = "01900000-0000-7000-8000-0000000009ff";

/** Dérive manuelle sur des lignes seedées. */
async function driftSeededRows(db: TestDatabase): Promise<void> {
  const label = "INSERT INTO ticket_labels (organization_id, ticket_id, label) VALUES ($1, $2, $3)";
  await db.query("UPDATE tickets SET title = 'dérivé', status = 'cancelled' WHERE key = 'TK-3'");
  await db.query("UPDATE sprints SET goal = 'dérivé' WHERE number = 1");
  await db.query("DELETE FROM ticket_labels WHERE ticket_id = $1", [ticketId(2)]);
  await db.query(label, [DEMO_ORG, ticketId(1), "intrus"]);
  await db.query("DELETE FROM ticket_dependencies WHERE ticket_id = $1", [ticketId(5)]);
  await db.query("UPDATE acceptance_criteria SET statement = 'dérivé' WHERE ticket_id = $1", [
    ticketId(4),
  ]);
}

/** Ticket TK-7 créé hors seed, avec label, dépendance, et compteur déjà avancé à 7. */
async function createOutsideTicket(db: TestDatabase): Promise<void> {
  await db.query(
    `INSERT INTO tickets (id, organization_id, project_id, key, title, description, type, status,
       priority, pkg, sensitivity, created_at, updated_at)
     VALUES ($1, $2, $3, 'TK-7', 'Hors seed', '', 'task', 'todo', 'low', 'api', 'safe', now(), now())`,
    [OUTSIDE_ID, DEMO_ORG, DEMO_PROJECT],
  );
  await db.query(
    "INSERT INTO ticket_labels (organization_id, ticket_id, label) VALUES ($1, $2, 'pkg:api')",
    [DEMO_ORG, OUTSIDE_ID],
  );
  await db.query(
    "INSERT INTO ticket_dependencies (organization_id, ticket_id, depends_on_id, type) VALUES ($1, $2, $3, 'blocks')",
    [DEMO_ORG, OUTSIDE_ID, ticketId(1)],
  );
  await db.query("UPDATE project_counters SET last_value = 7 WHERE name = 'ticket'");
}

describe("seed complet : réparation de dérive (TK-33)", () => {
  let db: TestDatabase;
  let canonical: Snapshot;
  let repaired: Snapshot;

  beforeAll(async () => {
    db = await migratedDb();
    await seed(db.url);
    canonical = await snapshot(db);
    await driftSeededRows(db);
    await createOutsideTicket(db);
    await seed(db.url);
    repaired = await snapshot(db);
  }, 180_000);

  afterAll(async () => {
    await db?.dispose();
  });

  it("remet tickets, sprint et critères seedés à l'état canonique", () => {
    const seeded = rowsOf(repaired, "tickets").filter((r) => r.key !== "TK-7");

    expect(seeded).toEqual(rowsOf(canonical, "tickets"));
    expect(rowsOf(repaired, "sprints")).toEqual(rowsOf(canonical, "sprints"));
    expect(rowsOf(repaired, "acceptance_criteria")).toEqual(
      rowsOf(canonical, "acceptance_criteria"),
    );
  });

  it("supprime les enfants en trop et rétablit les enfants manquants des tickets seedés", () => {
    for (const table of ["ticket_labels", "ticket_features", "ticket_dependencies"] as const) {
      const ofSeeded = rowsOf(repaired, table).filter((r) => r.ticket_id !== OUTSIDE_ID);
      expect(ofSeeded, table).toEqual(rowsOf(canonical, table));
    }
  });

  it("ne supprime, ne modifie ni ne duplique le ticket TK-7 hors seed et ses enfants", () => {
    const own = (table: "ticket_labels" | "ticket_dependencies") =>
      rowsOf(repaired, table).filter((r) => r.ticket_id === OUTSIDE_ID);

    expect(rowsOf(repaired, "tickets")).toHaveLength(7);
    expect(rowsOf(repaired, "tickets").filter((t) => t.key === "TK-7")).toEqual([
      expect.objectContaining({ id: OUTSIDE_ID, title: "Hors seed", status: "todo" }),
    ]);
    expect(own("ticket_labels")).toHaveLength(1);
    expect(own("ticket_dependencies")).toHaveLength(1);
  });

  it("ne fait jamais baisser le compteur : 7 reste 7 (GREATEST), sprint reste 1", () => {
    const counters = rowsOf(repaired, "project_counters");

    expect(counters.find((c) => c.name === "ticket")?.last_value).toBe(7);
    expect(counters.find((c) => c.name === "sprint")?.last_value).toBe(1);
  });
});

describe("seed complet : atomicité (TK-33)", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await migratedDb();
  }, 180_000);

  afterAll(async () => {
    await db?.dispose();
  });

  it("laisse la base inchangée quand une écriture échoue en cours de seed (ROLLBACK)", async () => {
    // La dernière table écrite par le seed n'existe plus : l'échec survient après les premiers upserts.
    await db.query("DROP TABLE project_counters");

    await expect(seed(db.url)).rejects.toThrow();

    for (const table of ["organizations", "users", "members", "projects", "sprints", "tickets"]) {
      expect(await db.query(`SELECT 1 FROM ${table}`), table).toHaveLength(0);
    }
  });
});

describe("seed complet : garde-fou production (TK-33)", () => {
  const UNREACHABLE = "postgresql://nobody:nothing@127.0.0.1:1/none";
  const failureOf = (run: Promise<unknown>) =>
    run.then(
      () => undefined,
      (error: unknown) => error as Error,
    );

  it("lève une erreur claire avant toute connexion quand NODE_ENV=production", async () => {
    // URL injoignable : une tentative de connexion donnerait ECONNREFUSED, pas l'erreur de garde.
    const failure = await failureOf(seed(UNREACHABLE, { env: { NODE_ENV: "production" } }));

    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).toMatch(/production/i);
    expect(failure?.message).not.toMatch(/ECONNREFUSED|connect/i);
  });

  it("n'écrit rien en base en production", async () => {
    const db = await migratedDb();
    try {
      await expect(seed(db.url, { env: { NODE_ENV: "production" } })).rejects.toThrow(
        /production/i,
      );

      expect(await db.query("SELECT 1 FROM organizations")).toHaveLength(0);
    } finally {
      await db.dispose();
    }
  }, 180_000);

  it.each([undefined, "development", "test"])(
    "autorise NODE_ENV=%s (tente la connexion : échoue sur la base injoignable)",
    async (nodeEnv) => {
      const env = nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv };
      const failure = await failureOf(seed(UNREACHABLE, { env }));

      expect(failure).toBeInstanceOf(Error);
      expect(failure?.message).not.toMatch(/production/i);
    },
  );

  it("expose assertSeedAllowed(env) qui refuse uniquement la production", async () => {
    const { assertSeedAllowed } = await import("../src/seed-guard.ts");

    expect(() => assertSeedAllowed({ NODE_ENV: "production" })).toThrow(/production/i);
    expect(() => assertSeedAllowed({ NODE_ENV: "development" })).not.toThrow();
    expect(() => assertSeedAllowed({ NODE_ENV: "test" })).not.toThrow();
    expect(() => assertSeedAllowed({})).not.toThrow();
  });
});
