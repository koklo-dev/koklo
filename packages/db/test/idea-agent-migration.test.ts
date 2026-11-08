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
import { IDEA_AGENT_ENUMS, IDEA_AGENT_SUFFIX, IDEA_AGENT_TABLES } from "./support/idea-fixtures.ts";

/**
 * TK-90 (lot A) : migration `*_idea_agent`. Quatre tables (propositions, messages, verrou d'appel d'IA,
 * dernier calcul des manques) et quatre types ; additive. `down.sql` retire tout ; rejouable ; `migrate
 * diff` vide.
 */
const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(IDEA_AGENT_SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, migration(), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");
const apply = (db: TestDatabase, dir: string, file: "migration.sql" | "down.sql") =>
  runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, file)], db.url);

describe("TK-90 migration idea_agent : fichiers", () => {
  it("existe, après 20261108090000_idea, avec un down.sql non vide", () => {
    expect(migration(), "dossier de migration *_idea_agent").toBeDefined();
    expect(migration()).toBe("20261108120000_idea_agent");
    const previous = dirs().find((dir) => dir.endsWith("_idea")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql crée quatre tables et quatre types, sans rien supprimer", () => {
    const up = code(sqlOf("migration.sql"));
    expect(up.match(/CREATE\s+TABLE/gi)).toHaveLength(4);
    expect(up.match(/CREATE\s+TYPE/gi)).toHaveLength(4);
    for (const table of IDEA_AGENT_TABLES) expect(up).toContain(`CREATE TABLE "${table}"`);
    expect(up).not.toMatch(/\bDROP\b|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|CREATE\s+TRIGGER/i);
  });

  it("down.sql retire les quatre tables puis les quatre types", () => {
    const down = code(sqlOf("down.sql"));
    for (const table of IDEA_AGENT_TABLES) expect(down).toContain(`DROP TABLE "public"."${table}"`);
    for (const name of IDEA_AGENT_ENUMS) expect(down).toContain(`DROP TYPE "public"."${name}"`);
    expect(down.lastIndexOf("DROP TABLE")).toBeLessThan(down.indexOf("DROP TYPE"));
  });

  it("expectedTables contient les quatre tables", () => {
    for (const table of IDEA_AGENT_TABLES) expect(expectedTables).toContain(table);
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

describe("TK-90 migration idea_agent : base", () => {
  it("applique tout jusqu'à la migration : les 54 tables attendues existent", async () => {
    for (const dir of dirs()) apply(db, dir, "migration.sql");
    expect(await tables()).toEqual([...expectedTables].sort());
  }, 180_000);

  it("down.sql retire les quatre tables, up les recrée (rejouable)", async () => {
    apply(db, migration(), "down.sql");
    const afterDown = await tables();
    for (const table of IDEA_AGENT_TABLES) expect(afterDown).not.toContain(table);
    expect(afterDown).toHaveLength(expectedTables.length - IDEA_AGENT_TABLES.length);
    apply(db, migration(), "migration.sql");
    expect(await tables()).toEqual([...expectedTables].sort());
  }, 180_000);

  it("migrate diff entre la base et schema.prisma est vide (code 0)", () => {
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 120_000);
});
