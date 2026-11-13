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
import { reviewScope } from "./support/reviews-fixtures.ts";
import { insertSnapshot } from "./support/spec-fixtures.ts";
import { sqlState } from "./support/ticket-fixtures.ts";

/**
 * TK-107 (lot A, B383) : migration `*_fixture_entity_kind` : `spec_entities_kind_check` accepte le genre `fixture` (jeux
 * d'exemple `data/fixtures/FX-*.yaml`). `down.sql` rejouable (up, down, up), `migrate diff` vide.
 */
const SUFFIX = "_fixture_entity_kind";
const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, migration(), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

describe("TK-107 migration fixture_entity_kind : dossier et contenu", () => {
  it("existe, après 20261112170000_review_withdrawn, avec un down.sql non vide", () => {
    expect(migration(), "dossier de migration *_fixture_entity_kind").toBeDefined();
    const previous = dirs().find((dir) => dir.endsWith("_review_withdrawn")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql : refait le CHECK du genre avec fixture, sans table ni fonction", () => {
    const up = code(sqlOf("migration.sql"));
    expect(up).toMatch(/DROP CONSTRAINT "spec_entities_kind_check"/);
    expect(up).toMatch(/ADD CONSTRAINT "spec_entities_kind_check" CHECK[^;]*'fixture'/);
    expect(up).not.toMatch(/CREATE\s+(?:TABLE|FUNCTION|TRIGGER)/i);
  });

  it("down.sql retire les lignes fixture puis restaure le CHECK sans fixture", () => {
    const down = code(sqlOf("down.sql"));
    expect(down).toMatch(/DELETE FROM "public"\."spec_entities" WHERE "kind" = 'fixture'/);
    expect(down).toMatch(/ADD CONSTRAINT "spec_entities_kind_check" CHECK/);
    expect(down).not.toMatch(/ADD CONSTRAINT "spec_entities_kind_check" CHECK[^;]*'fixture'/);
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

const entity = (scope: { organizationId: string }, snapshotId: string, kind: string) =>
  db.query(
    `INSERT INTO spec_entities (id, organization_id, snapshot_id, kind, spec_id, zone, path, data, content_hash, sort, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'data', 'data/x.yaml', '{"titre":"x"}'::jsonb, $5, 1, now(), now())`,
    [scope.organizationId, snapshotId, kind, `X-${kind}`, "a".repeat(64)],
  );

describe("TK-107 migration fixture_entity_kind : up, down, up", () => {
  it("deploy : spec_entities accepte le genre fixture et refuse toujours un genre inconnu", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const scope = await reviewScope(db, "fixture-up");
    const snapshot = await insertSnapshot(db, scope, scope.repoId);
    expect(await sqlState(() => entity(scope, snapshot, "fixture"))).toBeUndefined();
    expect(await sqlState(() => entity(scope, snapshot, "layout"))).toBe("23514");
  }, 180_000);

  it("down.sql ramène exactement à l'état précédent et retire les lignes fixture", async () => {
    for (const dir of dirs().filter((d) => d < migration())) {
      runPrismaOrThrow(
        ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
        baseline.url,
      );
    }
    const expected = await constraints(baseline);
    const scope = await reviewScope(db, "fixture-keep");
    const snapshot = await insertSnapshot(db, scope, scope.repoId);
    await entity(scope, snapshot, "table");
    await entity(scope, snapshot, "fixture");
    for (const dir of dirs()
      .filter((d) => d >= migration())
      .reverse()) {
      runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }
    expect(await constraints(db)).toEqual(expected);
    expect(await db.query("SELECT 1 FROM spec_entities WHERE kind = 'fixture'")).toHaveLength(0);
    expect(await db.query("SELECT 1 FROM spec_entities WHERE kind = 'table'")).toHaveLength(1);
  }, 180_000);

  it("second deploy : même contrainte qu'au premier, migrate diff vide (code 0)", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const scope = await reviewScope(db, "fixture-again");
    const snapshot = await insertSnapshot(db, scope, scope.repoId);
    expect(await sqlState(() => entity(scope, snapshot, "fixture"))).toBeUndefined();
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 180_000);
});
