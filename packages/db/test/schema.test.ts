import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectedTables, runPrismaOrThrow } from "./helpers/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "./helpers/test-database.ts";

const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

describe("schéma après migration (§18.1)", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
    runPrismaOrThrow(["migrate", "deploy"], db.url);
  }, 180_000);

  afterAll(async () => {
    await db?.dispose();
  }, 60_000);

  it("T3.3 les 7 tables Better Auth et projects existent avec les noms pluriels prévus", async () => {
    const rows = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'`,
    );

    expect(rows.map((row) => row.table_name).sort()).toEqual([...expectedTables].sort());
  });

  it("T3.1 tables et colonnes sont en snake_case", async () => {
    const rows = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'`,
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const { table_name, column_name } of rows) {
      expect(table_name, `table ${table_name}`).toMatch(SNAKE_CASE);
      expect(column_name, `${table_name}.${column_name}`).toMatch(SNAKE_CASE);
    }
  });

  it("T3.2 chaque table a une PK uuid et created_at/updated_at NOT NULL", async () => {
    const pks = await db.query<{ table_name: string; data_type: string }>(
      `SELECT tc.table_name, c.data_type
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage k
         ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
       JOIN information_schema.columns c
         ON c.table_schema = k.table_schema AND c.table_name = k.table_name
        AND c.column_name = k.column_name
       WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'`,
    );
    const pkByTable = new Map(pks.map((row) => [row.table_name, row.data_type]));
    for (const table of expectedTables) {
      expect(pkByTable.get(table), `PK de ${table}`).toBe("uuid");
    }

    const stamps = await db.query<{ table_name: string; column_name: string; is_nullable: string }>(
      `SELECT table_name, column_name, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name IN ('created_at', 'updated_at')`,
    );
    for (const table of expectedTables) {
      for (const column of ["created_at", "updated_at"]) {
        const found = stamps.find((s) => s.table_name === table && s.column_name === column);
        expect(found, `${table}.${column} existe`).toBeDefined();
        expect(found?.is_nullable, `${table}.${column} NOT NULL`).toBe("NO");
      }
    }
  });
});
