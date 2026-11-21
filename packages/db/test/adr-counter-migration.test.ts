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
 * TK-111 lot A (B514) : migration `*_adr_counter` : la valeur `adr` de `counter_name` (compteur `ADR-nnn` du projet).
 * Additive ; `down.sql` recrée l'enum sans `adr` (PostgreSQL ne retire pas une valeur), `migrate diff` vide.
 */
const SUFFIX = "_adr_counter";
const migration = () => listMigrationDirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, migration(), file), "utf8");
const BEFORE = ["ticket", "sprint", "feature", "suggestion", "rule"];

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

describe("TK-111 migration adr_counter", () => {
  it("existe, après 20261113110000_comment_table_target, avec un down.sql non vide", () => {
    expect(migration(), "dossier *_adr_counter").toBeDefined();
    const previous = listMigrationDirs().find((d) => d.endsWith("_comment_table_target")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf("migration.sql")).toMatch(/ALTER TYPE "counter_name" ADD VALUE 'adr'/);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("deploy ajoute la valeur adr ; schema.prisma la déclare ; migrate diff est vide", () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    expect(readFileSync(schemaPath, "utf8")).toMatch(/enum CounterName \{[^}]*\badr\b[^}]*\}/);
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 180_000);

  it("down.sql retire adr sans toucher aux autres compteurs, et rejoue (up, down, up)", async () => {
    expect(await labels()).toEqual([...BEFORE, "adr"]);
    await db.query(sqlOf("down.sql"));
    expect(await labels()).toEqual(BEFORE);
    await db.query(sqlOf("migration.sql"));
    expect(await labels()).toEqual([...BEFORE, "adr"]);
  }, 60_000);
});
