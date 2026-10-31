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
import { OAUTH_TABLES } from "./support/oauth-fixtures.ts";
import { SPEC_TABLES } from "./support/spec-fixtures.ts";
import { TICKET_TABLES } from "./support/ticket-fixtures.ts";

const MIGRATION_SUFFIX = "_tickets_sprints_leases";
const initialTables = expectedTables.filter(
  (table) =>
    !(TICKET_TABLES as readonly string[]).includes(table) &&
    !(SPEC_TABLES as readonly string[]).includes(table) &&
    !(OAUTH_TABLES as readonly string[]).includes(table),
);

async function inventory(db: TestDatabase) {
  const [tables, enums, functions, triggers] = await Promise.all([
    db.query<{ name: string }>(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' ORDER BY 1`,
    ),
    db.query<{ name: string }>(
      `SELECT t.typname AS name FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typtype = 'e' ORDER BY 1`,
    ),
    db.query<{ name: string }>(
      `SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' ORDER BY 1`,
    ),
    db.query<{ name: string }>(
      `SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1`,
    ),
  ]);
  return {
    tables: tables.map((r) => r.name),
    enums: enums.map((r) => r.name),
    functions: functions.map((r) => r.name),
    triggers: triggers.map((r) => r.name),
  };
}

describe("TK-28 C8 migration tickets_sprints_leases : up -> down -> up", () => {
  let db: TestDatabase;
  // TK-41 : la migration TK-28 n'est plus la dernière ; on la retrouve par son suffixe et on
  // défait d'abord les migrations postérieures (ordre inverse).
  const ticketsMigration = () =>
    listMigrationDirs().find((dir) => dir.endsWith(MIGRATION_SUFFIX)) as string;
  const fromTicketsMigration = () => listMigrationDirs().filter((dir) => dir >= ticketsMigration());

  beforeAll(async () => {
    db = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await db?.dispose();
  }, 60_000);

  it("la migration existe avec un down.sql relu non vide", () => {
    expect(ticketsMigration()).toMatch(new RegExp(`^\\d{14}${MIGRATION_SUFFIX}$`));
    const down = readFileSync(join(migrationsDir, ticketsMigration(), "down.sql"), "utf8");
    expect(down.trim().length).toBeGreaterThan(0);
  });

  it("deploy sur base vide crée toutes les tables, triggers compris", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);

    const state = await inventory(db);
    expect(state.tables).toEqual([...expectedTables].sort());
    expect(state.triggers.length).toBeGreaterThanOrEqual(2);
    expect(state.functions.length).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it("down de TK-28 (après celles qui le suivent) retire tables, types enum, fonctions et triggers", async () => {
    for (const dir of [...fromTicketsMigration()].reverse()) {
      runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }

    expect(await inventory(db)).toEqual({
      tables: [...initialTables].sort(),
      enums: [],
      functions: [],
      triggers: [],
    });
  }, 120_000);

  it("second deploy réussit et le schéma Prisma est identique (diff vide)", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);

    expect((await inventory(db)).tables).toEqual([...expectedTables].sort());
    const { status, output } = runPrisma(
      ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath, "--exit-code"],
      db.url,
    );
    expect(status, output).toBe(0);
  }, 120_000);
});
