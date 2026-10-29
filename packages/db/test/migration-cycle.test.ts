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

async function appTables(db: TestDatabase): Promise<string[]> {
  const rows = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
     ORDER BY table_name`,
  );
  return rows.map((row) => row.table_name);
}

describe("migration init : up -> down -> up (C1)", () => {
  let db: TestDatabase;
  const sortedTables = [...expectedTables].sort();

  beforeAll(async () => {
    db = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await db?.dispose();
  }, 60_000);

  it("T1.1 migrate deploy sur base vide crée les 19 tables et _prisma_migrations", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);

    expect(await appTables(db)).toEqual(sortedTables);
    const ledger = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM _prisma_migrations",
    );
    expect(Number(ledger[0]?.n)).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it("T1.2 les down.sql (ordre inverse) suppriment toutes les tables et types applicatifs", async () => {
    for (const dir of [...listMigrationDirs()].reverse()) {
      const downFile = join(migrationsDir, dir, "down.sql");
      runPrismaOrThrow(["db", "execute", "--file", downFile], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }

    expect(await appTables(db)).toEqual([]);
    const orphanTypes = await db.query<{ typname: string }>(
      `SELECT t.typname FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typtype = 'e'`,
    );
    expect(orphanTypes).toEqual([]);
  }, 120_000);

  it("T1.3 un second migrate deploy réussit", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);

    expect(await appTables(db)).toEqual(sortedTables);
  }, 120_000);

  it("T1.4 migrate diff entre la base et schema.prisma est vide (code 0)", () => {
    const { status, output } = runPrisma(
      ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath, "--exit-code"],
      db.url,
    );

    expect(status, output).toBe(0);
  }, 120_000);
});

describe("down.sql présent pour chaque migration (C2)", () => {
  it("T2.1 il y a au moins une migration et chacune a un down.sql non vide", () => {
    const dirs = listMigrationDirs();

    expect(dirs.length).toBeGreaterThanOrEqual(1);
    for (const dir of dirs) {
      const down = readFileSync(join(migrationsDir, dir, "down.sql"), "utf8");
      expect(down.trim().length, `${dir}/down.sql vide`).toBeGreaterThan(0);
    }
  });
});
