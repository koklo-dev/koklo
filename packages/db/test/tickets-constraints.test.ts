import { randomUUID } from "node:crypto";
import { formatTicketKey } from "@koklo/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import {
  insertAudit,
  insertCounter,
  insertLease,
  insertProjectState,
  insertScope,
  insertSprint,
  insertTicket,
  openPool,
  type Scope,
  sqlState,
} from "./support/ticket-fixtures.ts";

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
}, 180_000);

afterAll(async () => {
  await db?.dispose();
}, 60_000);

describe("TK-28 C2 bail actif unique par ticket", () => {
  let scope: Scope;
  beforeAll(async () => {
    scope = await insertScope(db, "lease");
  });

  it("deux insertions concurrentes de baux non libérés : une réussit, l'autre échoue en 23505", async () => {
    const ticket = await insertTicket(db, scope, { key: "TK-1" });

    const outcomes = await Promise.allSettled([
      insertLease(db, scope, ticket),
      insertLease(db, scope, ticket),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o): o is PromiseRejectedResult => o.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const reason = rejected[0]?.reason as { code?: string } | undefined;
    expect(reason?.code).toBe(UNIQUE_VIOLATION);
    const rows = await db.query("SELECT 1 FROM leases WHERE ticket_id = $1", [ticket]);
    expect(rows).toHaveLength(1);
  });

  it("un bail libéré (released_at renseigné) n'empêche pas un nouvel insert", async () => {
    const ticket = await insertTicket(db, scope, { key: "TK-2" });
    await insertLease(db, scope, ticket, { releasedAt: new Date().toISOString() });

    await insertLease(db, scope, ticket);

    const rows = await db.query("SELECT 1 FROM leases WHERE ticket_id = $1", [ticket]);
    expect(rows).toHaveLength(2);
  });

  it("deux tickets différents peuvent chacun avoir un bail actif", async () => {
    const first = await insertTicket(db, scope, { key: "TK-3" });
    const second = await insertTicket(db, scope, { key: "TK-4" });

    await insertLease(db, scope, first);
    await insertLease(db, scope, second);
  });
});

describe("TK-28 C2 bail : libération et expiration", () => {
  let scope: Scope;
  beforeAll(async () => {
    scope = await insertScope(db, "lease-expiry");
  });

  it("H1 un bail expiré mais non libéré bloque, puis la libération explicite débloque", async () => {
    const ticket = await insertTicket(db, scope, { key: "TK-5" });
    await insertLease(db, scope, ticket, { expiresAt: "2020-01-01T00:00:00Z" });

    expect(await sqlState(() => insertLease(db, scope, ticket))).toBe(UNIQUE_VIOLATION);

    await db.query(
      "UPDATE leases SET released_at = now() WHERE ticket_id = $1 AND released_at IS NULL AND expires_at <= now()",
      [ticket],
    );
    await insertLease(db, scope, ticket);
  });

  it("le type de titulaire est fermé (member, runner)", async () => {
    const member = await insertTicket(db, scope, { key: "TK-6" });
    const robot = await insertTicket(db, scope, { key: "TK-7" });

    await insertLease(db, scope, member, { holderKind: "member" });
    const state = await sqlState(() => insertLease(db, scope, robot, { holderKind: "robot" }));
    expect(["22P02", CHECK_VIOLATION]).toContain(state);
  });
});

describe("TK-28 C3 compteur de clés transactionnel", () => {
  const COUNTER_SQL =
    "UPDATE project_counters SET last_value = last_value + 1, updated_at = now() WHERE project_id = $1 AND name = 'ticket' RETURNING last_value";

  it("20 transactions concurrentes obtiennent 1..20 sans trou ni doublon et des clés distinctes", async () => {
    const scope = await insertScope(db, "counter");
    await insertCounter(db, scope);
    const pool = openPool(db.url, 20);
    try {
      const keys = await Promise.all(
        Array.from({ length: 20 }, async () => {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            const { rows } = await client.query<{ last_value: string | number }>(COUNTER_SQL, [
              scope.projectId,
            ]);
            const value = Number(rows[0]?.last_value);
            await insertTicket(client, scope, { key: formatTicketKey(value) });
            await client.query("COMMIT");
            return value;
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          } finally {
            client.release();
          }
        }),
      );

      expect([...keys].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
      const stored = await db.query<{ key: string }>(
        "SELECT key FROM tickets WHERE project_id = $1",
        [scope.projectId],
      );
      expect(new Set(stored.map((r) => r.key)).size).toBe(20);
    } finally {
      await pool.end();
    }
  }, 60_000);
});

describe("TK-28 C3 compteur : projets, rollback, unicité", () => {
  const COUNTER_SQL =
    "UPDATE project_counters SET last_value = last_value + 1, updated_at = now() WHERE project_id = $1 AND name = 'ticket' RETURNING last_value";

  it("deux projets ont des suites indépendantes", async () => {
    const a = await insertScope(db, "counter-a");
    const b = await insertScope(db, "counter-b");
    await insertCounter(db, a);
    await insertCounter(db, b);

    await db.query(COUNTER_SQL, [a.projectId]);
    await db.query(COUNTER_SQL, [a.projectId]);
    const [forB] = await db.query<{ last_value: string | number }>(COUNTER_SQL, [b.projectId]);

    expect(Number(forB?.last_value)).toBe(1);
  });

  it("un rollback de transaction ne consomme pas de valeur", async () => {
    const scope = await insertScope(db, "counter-rollback");
    await insertCounter(db, scope);
    const pool = openPool(db.url, 1);
    try {
      const client = await pool.connect();
      await client.query("BEGIN");
      await client.query(COUNTER_SQL, [scope.projectId]);
      await client.query("ROLLBACK");
      client.release();
    } finally {
      await pool.end();
    }

    const [next] = await db.query<{ last_value: string | number }>(COUNTER_SQL, [scope.projectId]);
    expect(Number(next?.last_value)).toBe(1);
  });

  it("UNIQUE(project_id, key) refuse un doublon forcé", async () => {
    const scope = await insertScope(db, "dup-key");
    await insertTicket(db, scope, { key: "TK-1" });

    expect(await sqlState(() => insertTicket(db, scope, { key: "TK-1" }))).toBe(UNIQUE_VIOLATION);
    const other = await insertScope(db, "dup-key-other");
    await insertTicket(db, other, { key: "TK-1" });
  });

  it("le compteur est unique par (projet, nom) et son nom est fermé (ticket, sprint)", async () => {
    const scope = await insertScope(db, "counter-names");
    await insertCounter(db, scope, "ticket");
    await insertCounter(db, scope, "sprint");

    expect(await sqlState(() => insertCounter(db, scope, "ticket"))).toBe(UNIQUE_VIOLATION);
    const state = await sqlState(() => insertCounter(db, scope, "release"));
    expect(["22P02", CHECK_VIOLATION]).toContain(state);
  });
});

describe("TK-28 C4 audit_log immuable", () => {
  it("INSERT réussit puis UPDATE, DELETE et TRUNCATE échouent et la ligne reste intacte", async () => {
    const scope = await insertScope(db, "audit");
    const id = await insertAudit(db, scope, "ticket.created");

    const update = await sqlState(() =>
      db.query("UPDATE audit_log SET action = 'falsifié' WHERE id = $1", [id]),
    );
    const remove = await sqlState(() => db.query("DELETE FROM audit_log WHERE id = $1", [id]));
    const truncate = await sqlState(() => db.query("TRUNCATE audit_log"));

    expect(update, "UPDATE doit être refusé").toBeDefined();
    expect(remove, "DELETE doit être refusé").toBeDefined();
    expect(truncate, "TRUNCATE doit être refusé").toBeDefined();
    const rows = await db.query<{ action: string }>("SELECT action FROM audit_log WHERE id = $1", [
      id,
    ]);
    expect(rows).toEqual([{ action: "ticket.created" }]);
  });

  it("un UPDATE en masse est refusé aussi", async () => {
    const scope = await insertScope(db, "audit-bulk");
    await insertAudit(db, scope);

    expect(await sqlState(() => db.query("UPDATE audit_log SET actor_id = 'x'"))).toBeDefined();
  });

  it("la suppression de l'organisation emporte son journal (cascade), pas la suppression directe", async () => {
    const scope = await insertScope(db, "audit-cascade");
    const id = await insertAudit(db, scope);

    await db.query("DELETE FROM organizations WHERE id = $1", [scope.organizationId]);

    expect(await db.query("SELECT 1 FROM audit_log WHERE id = $1", [id])).toHaveLength(0);
  });
});

describe("TK-28 C5 un seul sprint actif par projet", () => {
  it("le second sprint actif d'un projet est refusé (23505), un autre projet peut avoir le sien", async () => {
    const a = await insertScope(db, "sprint-a");
    const b = await insertScope(db, "sprint-b");
    await insertSprint(db, a, { number: 1, status: "active" });

    expect(await sqlState(() => insertSprint(db, a, { number: 2, status: "active" }))).toBe(
      UNIQUE_VIOLATION,
    );
    await insertSprint(db, b, { number: 1, status: "active" });
  });

  it("plusieurs sprints planned ou closed coexistent avec un actif", async () => {
    const scope = await insertScope(db, "sprint-many");
    await insertSprint(db, scope, { number: 1, status: "closed" });
    await insertSprint(db, scope, { number: 2, status: "closed" });
    await insertSprint(db, scope, { number: 3, status: "planned" });
    await insertSprint(db, scope, { number: 4, status: "planned" });
    await insertSprint(db, scope, { number: 5, status: "active" });
  });

  it("UNIQUE(project_id, number) refuse un numéro de sprint en double", async () => {
    const scope = await insertScope(db, "sprint-number");
    await insertSprint(db, scope, { number: 7 });

    expect(await sqlState(() => insertSprint(db, scope, { number: 7 }))).toBe(UNIQUE_VIOLATION);
  });

  it("le statut de sprint est fermé (planned, active, closed)", async () => {
    const scope = await insertScope(db, "sprint-status");

    const state = await sqlState(() => insertSprint(db, scope, { number: 1, status: "paused" }));

    expect(["22P02", CHECK_VIOLATION]).toContain(state);
  });
});

describe("TK-28 C6 état de projet à écriture optimiste", () => {
  const WRITE_SQL =
    "UPDATE project_states SET content = $3::jsonb, version = version + 1, updated_at = now() WHERE project_id = $1 AND version = $2";

  it("écriture avec la bonne version : version + 1 ; version périmée : 0 ligne", async () => {
    const scope = await insertScope(db, "state");
    await insertProjectState(db, scope, 1);
    const pool = openPool(db.url, 1);
    try {
      const fresh = await pool.query(WRITE_SQL, [scope.projectId, 1, '{"a":1}']);
      const stale = await pool.query(WRITE_SQL, [scope.projectId, 1, '{"a":2}']);

      expect(fresh.rowCount).toBe(1);
      expect(stale.rowCount).toBe(0);
    } finally {
      await pool.end();
    }
    const [row] = await db.query<{ version: number; content: unknown }>(
      "SELECT version, content FROM project_states WHERE project_id = $1",
      [scope.projectId],
    );
    expect(Number(row?.version)).toBe(2);
    expect(row?.content).toEqual({ a: 1 });
  });

  it("deux écritures concurrentes sur la même version : une seule gagne", async () => {
    const scope = await insertScope(db, "state-race");
    await insertProjectState(db, scope, 1);
    const pool = openPool(db.url, 2);
    try {
      const [first, second] = await Promise.all([
        pool.query(WRITE_SQL, [scope.projectId, 1, '{"w":1}']),
        pool.query(WRITE_SQL, [scope.projectId, 1, '{"w":2}']),
      ]);

      expect((first.rowCount ?? 0) + (second.rowCount ?? 0)).toBe(1);
    } finally {
      await pool.end();
    }
  });

  it("version >= 1 en CHECK, un seul état par projet, contenu = objet jsonb", async () => {
    const scope = await insertScope(db, "state-checks");

    expect(await sqlState(() => insertProjectState(db, scope, 0))).toBe(CHECK_VIOLATION);
    expect(await sqlState(() => insertProjectState(db, scope, 1, "[1,2]"))).toBe(CHECK_VIOLATION);
    await insertProjectState(db, scope, 1);
    expect(await sqlState(() => insertProjectState(db, scope, 1))).toBe(UNIQUE_VIOLATION);
  });
});

describe("TK-28 contraintes des tickets et tables de liaison", () => {
  let scope: Scope;
  beforeAll(async () => {
    scope = await insertScope(db, "ticket-checks");
  });

  it("attempts, review_rounds et estimate_hours négatifs sont refusés (CHECK)", async () => {
    expect(await sqlState(() => insertTicket(db, scope, { key: "TK-1", attempts: -1 }))).toBe(
      CHECK_VIOLATION,
    );
    expect(await sqlState(() => insertTicket(db, scope, { key: "TK-2", reviewRounds: -1 }))).toBe(
      CHECK_VIOLATION,
    );
    expect(
      await sqlState(() => insertTicket(db, scope, { key: "TK-3", estimateHours: -0.5 })),
    ).toBe(CHECK_VIOLATION);
    await insertTicket(db, scope, { key: "TK-4", estimateHours: 0 });
  });

  it("un seul paquet par ticket, hors liste refusé ; labels et features sans doublon", async () => {
    const ticket = await insertTicket(db, scope, { key: "TK-10" });
    expect(await sqlState(() => insertTicket(db, scope, { key: "TK-11", pkg: "web,api" }))).toBe(
      "22P02",
    );

    const insertLabel = () =>
      db.query(
        "INSERT INTO ticket_labels (organization_id, ticket_id, label) VALUES ($1, $2, 'area:x')",
        [scope.organizationId, ticket],
      );
    await insertLabel();
    expect(await sqlState(insertLabel)).toBe(UNIQUE_VIOLATION);

    const insertFeature = () =>
      db.query(
        "INSERT INTO ticket_features (organization_id, ticket_id, feature_ref) VALUES ($1, $2, 'F-001')",
        [scope.organizationId, ticket],
      );
    await insertFeature();
    expect(await sqlState(insertFeature)).toBe(UNIQUE_VIOLATION);
  });
});

describe("TK-28 contraintes des dépendances, critères et cascade", () => {
  let scope: Scope;
  beforeAll(async () => {
    scope = await insertScope(db, "ticket-links");
  });

  it("critères d'acceptation : position unique par ticket", async () => {
    const ticket = await insertTicket(db, scope, { key: "TK-12" });
    const insertCriterion = () =>
      db.query(
        `INSERT INTO acceptance_criteria (id, organization_id, ticket_id, position, statement, created_at, updated_at)
         VALUES ($1, $2, $3, 1, 'Etant donné…', now(), now())`,
        [randomUUID(), scope.organizationId, ticket],
      );
    await insertCriterion();
    expect(await sqlState(insertCriterion)).toBe(UNIQUE_VIOLATION);
  });

  it("dépendances : pas d'auto-dépendance, pas de doublon, type fermé", async () => {
    const first = await insertTicket(db, scope, { key: "TK-13" });
    const second = await insertTicket(db, scope, { key: "TK-14" });
    const insertDependency = (from: string, to: string, type = "blocks") =>
      db.query(
        "INSERT INTO ticket_dependencies (organization_id, ticket_id, depends_on_id, type) VALUES ($1, $2, $3, $4)",
        [scope.organizationId, from, to, type],
      );

    expect(await sqlState(() => insertDependency(first, first))).toBe(CHECK_VIOLATION);
    await insertDependency(first, second);
    expect(await sqlState(() => insertDependency(first, second))).toBe(UNIQUE_VIOLATION);
    await insertDependency(first, second, "related");
    expect(["22P02", CHECK_VIOLATION]).toContain(
      await sqlState(() => insertDependency(second, first, "needs")),
    );
  });
});

describe("TK-28 contraintes des commentaires et de la cascade", () => {
  let scope: Scope;
  beforeAll(async () => {
    scope = await insertScope(db, "ticket-comments");
  });

  it("commentaires : cible et auteur fermés, suppression logique via deleted_at", async () => {
    const ticket = await insertTicket(db, scope, { key: "TK-15" });
    const insertComment = (targetKind: string, authorKind: string) =>
      db.query(
        `INSERT INTO ticket_comments (id, organization_id, target_kind, target_id, author_kind, author_id, body, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NULL, 'ok', now(), now())`,
        [randomUUID(), scope.organizationId, targetKind, ticket, authorKind],
      );

    await insertComment("ticket", "agent");
    await insertComment("change_request", "client");
    expect(["22P02", CHECK_VIOLATION]).toContain(
      await sqlState(() => insertComment("epic", "agent")),
    );
    expect(["22P02", CHECK_VIOLATION]).toContain(
      await sqlState(() => insertComment("ticket", "alien")),
    );
  });

  it("supprimer le projet supprime en cascade tickets, sprints, états, compteurs et baux", async () => {
    const doomed = await insertScope(db, "cascade");
    const ticket = await insertTicket(db, doomed, { key: "TK-1" });
    await insertLease(db, doomed, ticket);
    await insertSprint(db, doomed, { number: 1 });
    await insertProjectState(db, doomed);
    await insertCounter(db, doomed);

    await db.query("DELETE FROM projects WHERE id = $1", [doomed.projectId]);

    for (const table of ["tickets", "sprints", "project_states", "project_counters"]) {
      const rows = await db.query(`SELECT 1 FROM ${table} WHERE project_id = $1`, [
        doomed.projectId,
      ]);
      expect(rows, table).toHaveLength(0);
    }
    expect(await db.query("SELECT 1 FROM leases WHERE ticket_id = $1", [ticket])).toHaveLength(0);
  });
});
