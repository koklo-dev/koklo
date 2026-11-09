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
import { IDEA_VERSIONS_SUFFIX, IDEA_VERSIONS_TABLES } from "./support/idea-fixtures.ts";

/**
 * TK-91 (lot A) : migration `*_idea_versions`. Deux tables (versions figées, Synthèse) ; additive. `down.sql` les
 * retire ; rejouable ; `migrate diff` vide.
 */
const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(IDEA_VERSIONS_SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, migration(), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");
const apply = (db: TestDatabase, dir: string, file: "migration.sql" | "down.sql") =>
  runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, file)], db.url);

describe("TK-91 migration idea_versions : fichiers", () => {
  it("existe, après 20261108120000_idea_agent, avec un down.sql non vide", () => {
    expect(migration(), "dossier de migration *_idea_versions").toBeDefined();
    expect(migration()).toBe("20261109090000_idea_versions");
    const previous = dirs().find((dir) => dir.endsWith("_idea_agent")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql crée deux tables, sans rien supprimer, et pose les bornes (number 1..9999, étiquette, source)", () => {
    const up = code(sqlOf("migration.sql"));
    expect(up.match(/CREATE\s+TABLE/gi)).toHaveLength(2);
    for (const table of IDEA_VERSIONS_TABLES) expect(up).toContain(`CREATE TABLE "${table}"`);
    expect(up).not.toMatch(/\bDROP\b|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|CREATE\s+TRIGGER/i);
    expect(up).toContain("BETWEEN 1 AND 9999");
    expect(up).toContain("^idea-v[1-9][0-9]{0,3}$");
  });

  it("down.sql retire les deux tables", () => {
    const down = code(sqlOf("down.sql"));
    for (const table of IDEA_VERSIONS_TABLES)
      expect(down).toContain(`DROP TABLE "public"."${table}"`);
  });

  it("expectedTables contient les deux tables", () => {
    for (const table of IDEA_VERSIONS_TABLES) expect(expectedTables).toContain(table);
  });
});

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
}, 180_000);
afterAll(async () => {
  await db?.dispose();
}, 60_000);

const tables = async () =>
  (
    await db.query<{ name: string }>(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' ORDER BY 1`,
    )
  ).map((row) => row.name);

describe("TK-91 migration idea_versions : base", () => {
  it("applique tout jusqu'à la migration : les tables attendues existent", async () => {
    for (const dir of dirs()) apply(db, dir, "migration.sql");
    expect(await tables()).toEqual([...expectedTables].sort());
  }, 180_000);

  it("down.sql retire les deux tables, up les recrée (rejouable)", async () => {
    apply(db, migration(), "down.sql");
    const afterDown = await tables();
    for (const table of IDEA_VERSIONS_TABLES) expect(afterDown).not.toContain(table);
    expect(afterDown).toHaveLength(expectedTables.length - IDEA_VERSIONS_TABLES.length);
    apply(db, migration(), "migration.sql");
    expect(await tables()).toEqual([...expectedTables].sort());
  }, 180_000);

  it("migrate diff entre la base et schema.prisma est vide (code 0)", () => {
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 120_000);
});
