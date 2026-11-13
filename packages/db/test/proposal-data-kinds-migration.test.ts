import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  listMigrationDirs,
  migrationsDir,
  runPrisma,
  runPrismaOrThrow,
  schemaPath,
} from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { notificationScope } from "./support/notifications-fixtures.ts";
import { sqlState } from "./support/ticket-fixtures.ts";

/**
 * TK-107 (lot B, B387/B391) : migration `*_proposal_data_kinds` : `agent_proposals_kind_check` accepte `table`, `relations`
 * et `fixtures`. `down.sql` rejouable (up, down, up), `migrate diff` vide.
 */
const SUFFIX = "_proposal_data_kinds";
const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, migration(), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

describe("TK-107 migration proposal_data_kinds : dossier et contenu", () => {
  it("existe, après 20261113090000_fixture_entity_kind, avec un down.sql non vide", () => {
    expect(migration(), "dossier de migration *_proposal_data_kinds").toBeDefined();
    const previous = dirs().find((dir) => dir.endsWith("_fixture_entity_kind")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql : refait le CHECK du type avec table, relations, fixtures, sans table ni fonction", () => {
    const up = code(sqlOf("migration.sql"));
    expect(up).toMatch(/DROP CONSTRAINT "agent_proposals_kind_check"/);
    expect(up).toMatch(
      /ADD CONSTRAINT "agent_proposals_kind_check" CHECK[^;]*'table'[^;]*'relations'[^;]*'fixtures'/,
    );
    expect(up).not.toMatch(/CREATE\s+(?:TABLE|FUNCTION|TRIGGER)/i);
  });

  it("down.sql retire les propositions des trois types puis restaure le CHECK d'origine", () => {
    const down = code(sqlOf("down.sql"));
    expect(down).toMatch(/DELETE FROM "public"\."agent_proposals" WHERE "kind" IN/);
    expect(down).toMatch(/ADD CONSTRAINT "agent_proposals_kind_check" CHECK/);
    expect(down).not.toMatch(/ADD CONSTRAINT "agent_proposals_kind_check" CHECK[^;]*'table'/);
  });
});

let db: TestDatabase;
let baseline: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  baseline = await createTestDatabase();
}, 180_000);

afterAll(async () => {
  await db?.dispose();
  await baseline?.dispose();
}, 60_000);

const constraints = async (target: TestDatabase) =>
  (
    await target.query<{ name: string }>(
      `SELECT cl.relname || '.' || con.conname || ' ' || pg_get_constraintdef(con.oid) AS name
       FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       WHERE n.nspname = 'public' AND cl.relname <> '_prisma_migrations' ORDER BY 1`,
    )
  ).map((row) => row.name);

interface Scope {
  organizationId: string;
  projectId: string;
  userId: string;
}

async function proposal(scope: Scope, kind: string, launchId?: string) {
  const launch = launchId ?? randomUUID();
  if (launchId === undefined) {
    await db.query(
      `INSERT INTO agent_launches (id, organization_id, project_id, deliverable, mode, status, requested_by, sources, updated_at)
       VALUES ($1, $2, $3, 'data', 'complete', 'done', $4, '["data.current"]'::jsonb, now())`,
      [launch, scope.organizationId, scope.projectId, scope.userId],
    );
  }
  await db.query(
    `INSERT INTO agent_proposals (id, organization_id, project_id, launch_id, deliverable, kind, zone, position, title, rationale, payload, status, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'data', $4, 'Réservations', 0, 'Titre', 'Raison', '{}'::jsonb, 'pending', now())`,
    [scope.organizationId, scope.projectId, launch, kind],
  );
  return launch;
}

describe("TK-107 migration proposal_data_kinds : up, down, up", () => {
  it("deploy : les trois types sont acceptés, un type inconnu reste refusé (23514)", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const scope = await notificationScope(db, "kinds-up");
    const launch = await proposal(scope, "table");
    for (const kind of ["relations", "fixtures"]) {
      expect(await sqlState(() => proposal(scope, kind, launch)), kind).toBeUndefined();
    }
    expect(await sqlState(() => proposal(scope, "dessin", launch))).toBe("23514");
  }, 180_000);

  it("down.sql ramène exactement à l'état précédent et retire les propositions des trois types", async () => {
    for (const dir of dirs().filter((d) => d < migration())) {
      runPrismaOrThrow(
        ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
        baseline.url,
      );
    }
    const expected = await constraints(baseline);
    const scope = await notificationScope(db, "kinds-keep");
    const launch = await proposal(scope, "feature");
    await proposal(scope, "table", launch);
    for (const dir of dirs()
      .filter((d) => d >= migration())
      .reverse()) {
      runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }
    expect(await constraints(db)).toEqual(expected);
    expect(await db.query("SELECT 1 FROM agent_proposals WHERE kind = 'table'")).toHaveLength(0);
    expect(await db.query("SELECT 1 FROM agent_proposals WHERE kind = 'feature'")).toHaveLength(1);
  }, 180_000);

  it("second deploy : mêmes contraintes qu'au premier, migrate diff vide (code 0)", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 180_000);
});
