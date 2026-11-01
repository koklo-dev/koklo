import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  expectedTables,
  listMigrationDirs,
  migrationsDir,
  runPrisma,
  runPrismaOrThrow,
  schemaPath,
} from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { LLM_TABLES } from "./support/llm-credentials-fixtures.ts";
import { OAUTH_TABLES } from "./support/oauth-fixtures.ts";
import { insertDelivery, insertFullTree, SPEC_TABLES } from "./support/spec-fixtures.ts";
import { SUGGESTION_TABLES } from "./support/suggestions-fixtures.ts";
import { insertScope } from "./support/ticket-fixtures.ts";

/** Inventaire complet des objets applicatifs : toute différence est un résidu ou un manque. */
async function inventory(db: TestDatabase) {
  const names = async (sql: string) => (await db.query<{ name: string }>(sql)).map((r) => r.name);
  return {
    tables: await names(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' ORDER BY 1`,
    ),
    enums: await names(
      `SELECT t.typname AS name FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typtype = 'e' ORDER BY 1`,
    ),
    functions: await names(
      `SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' ORDER BY 1`,
    ),
    triggers: await names(
      `SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1`,
    ),
    indexes: await names(
      `SELECT indexname || ' ' || indexdef AS name FROM pg_indexes
       WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY 1`,
    ),
    constraints: await names(
      `SELECT cl.relname || '.' || con.conname || ' ' || pg_get_constraintdef(con.oid) AS name
       FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       WHERE n.nspname = 'public' AND cl.relname <> '_prisma_migrations' ORDER BY 1`,
    ),
  };
}

/**
 * Référence : les migrations antérieures à celle de TK-41 seules, appliquées à la main sur une
 * autre base. TK-44a : la migration TK-41 n'est plus la dernière ; on la retrouve par son suffixe.
 */
async function applyEarlierMigrations(target: TestDatabase): Promise<TestDatabase> {
  for (const dir of listMigrationDirs().filter((d) => d < specIndexMigration())) {
    runPrismaOrThrow(
      ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
      target.url,
    );
  }
  return target;
}

async function expectSpecTablesEmpty(db: TestDatabase): Promise<void> {
  for (const table of SPEC_TABLES) {
    const rows = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`);
    expect(rows[0]?.n, `${table} vide après down -> up`).toBe("0");
  }
}

/** Tables créées par TK-41 puis TK-48a1 : absentes de l'état « TK-28 ». */
const LATER_TABLES: readonly string[] = [
  ...SPEC_TABLES,
  ...OAUTH_TABLES,
  ...LLM_TABLES,
  ...SUGGESTION_TABLES,
];
const dirs = () => listMigrationDirs();
const specIndexMigration = () =>
  dirs().find((dir) => dir.endsWith("_provider_spec_index")) as string;
const fromSpecIndexMigration = () => dirs().filter((dir) => dir >= specIndexMigration());
const sqlOf = (dir: string, file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, dir, file), "utf8");

describe("TK-41 C1 migration : dossier et down.sql", () => {
  it("la migration TK-41 suit celle de TK-28 et son down.sql n'est pas vide", () => {
    const all = dirs();
    expect(all.length, "init + tickets + TK-41").toBeGreaterThanOrEqual(3);
    expect(specIndexMigration()).toMatch(/^\d{14}_[a-z0-9_]+$/);
    expect(specIndexMigration().endsWith("_tickets_sprints_leases")).toBe(false);
    expect(sqlOf(specIndexMigration(), "down.sql").trim().length).toBeGreaterThan(0);
  });

  it("la migration TK-41 est additive : aucun DROP TABLE/COLUMN ni ALTER COLUMN TYPE dans migration.sql", () => {
    const up = sqlOf(specIndexMigration(), "migration.sql");
    expect(up).not.toMatch(
      /DROP\s+TABLE|DROP\s+COLUMN|ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE/i,
    );
    expect(up).toMatch(/CREATE TABLE "webhook_deliveries"/);
  });
});

describe("TK-41 C1 migration : up -> (données) -> down -> up, sans résidu", () => {
  let db: TestDatabase;
  let baseline: TestDatabase;
  let afterFirstUp: Awaited<ReturnType<typeof inventory>>;

  beforeAll(async () => {
    db = await createTestDatabase();
    baseline = await createTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await db?.dispose();
    await baseline?.dispose();
  }, 60_000);

  it("deploy sur base vide crée les 13 nouvelles tables (expectedTables étendu)", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);

    afterFirstUp = await inventory(db);
    expect(afterFirstUp.tables).toEqual([...expectedTables].sort());
    for (const table of SPEC_TABLES) expect(afterFirstUp.tables).toContain(table);
  }, 180_000);

  it("down.sql ramène exactement à l'état TK-28 : mêmes tables, types, fonctions, triggers, index et contraintes", async () => {
    const expected = await inventory(await applyEarlierMigrations(baseline));
    const scope = await insertScope(db, "migration");
    await insertFullTree(db, scope);
    await insertDelivery(db);

    // Les migrations postérieures sont défaites d'abord (ordre inverse), puis celle de TK-41.
    for (const dir of [...fromSpecIndexMigration()].reverse()) {
      runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }

    const actual = await inventory(db);
    expect(actual.tables).toEqual(expectedTables.filter((t) => !LATER_TABLES.includes(t)).sort());
    expect(actual).toEqual(expected);
  }, 180_000);

  it("second deploy réussit, sans donnée résiduelle, avec le même inventaire qu'au premier up", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);

    expect(await inventory(db)).toEqual(afterFirstUp);
    await expectSpecTablesEmpty(db);
  }, 180_000);

  it("migrate diff entre la base et schema.prisma est vide (code 0)", () => {
    const { status, output } = runPrisma(
      ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath, "--exit-code"],
      db.url,
    );

    expect(status, output).toBe(0);
  }, 120_000);
});
