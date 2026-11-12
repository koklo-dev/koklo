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

/**
 * TK-103 lot A (B339) : migration `*_rule_counter` : la valeur `rule` de `counter_name` (compteur `R-nnn` du projet).
 * Additive ; `down.sql` recrée l'enum sans `rule` (PostgreSQL ne retire pas une valeur), `migrate diff` vide.
 */
const SUFFIX = "_rule_counter";
const migration = () => listMigrationDirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, migration(), file), "utf8");

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
}, 180_000);
afterAll(async () => {
  await db?.dispose();
}, 60_000);

const labels = async () =>
  (
    await db.query<{ enumlabel: string }>(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'counter_name' ORDER BY e.enumsortorder`,
    )
  ).map((row) => row.enumlabel);

describe("TK-103 migration rule_counter", () => {
  it("existe, après 20261112120000, avec un down.sql non vide", () => {
    expect(migration(), "dossier *_rule_counter").toBeDefined();
    expect(migration()).toBe("20261112150000_rule_counter");
    expect(sqlOf("migration.sql")).toMatch(/ALTER TYPE "counter_name" ADD VALUE 'rule'/);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("deploy ajoute la valeur rule ; schema.prisma la déclare ; migrate diff est vide", () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    expect(readFileSync(schemaPath, "utf8")).toMatch(/enum CounterName \{[^}]*\brule\b[^}]*\}/);
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 180_000);

  it("down.sql retire rule sans toucher aux autres compteurs, et rejoue (up, down, up)", async () => {
    expect(await labels()).toEqual(["ticket", "sprint", "feature", "suggestion", "rule"]);
    await db.query(sqlOf("down.sql"));
    expect(await labels()).toEqual(["ticket", "sprint", "feature", "suggestion"]);
    await db.query(sqlOf("migration.sql"));
    expect(await labels()).toEqual(["ticket", "sprint", "feature", "suggestion", "rule"]);
  }, 60_000);
});
