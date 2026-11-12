import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as dbPackage from "../src/index.ts";
import {
  expectedTables,
  listMigrationDirs,
  migrationsDir,
  runPrisma,
  runPrismaOrThrow,
  schemaPath,
} from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";

/**
 * TK-100 (lot B) : migration `*_spec_entities_review_versions` : index d'entités générique `spec_entities`, table annexe
 * `review_versions` (hachage du contenu validé), colonne marqueur `spec_snapshots.entities_indexed_at`, quatre valeurs
 * ajoutées à `review_target_kind`. `down.sql` rejouable (types recréés), `migrate diff` vide.
 */
const SUFFIX = "_spec_entities_review_versions";
const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, migration(), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

describe("TK-100 migration spec_entities : dossier et contenu", () => {
  it("existe, après 20261112090000_deliverable_overrides, avec un down.sql non vide", () => {
    expect(migration(), "dossier de migration *_spec_entities_review_versions").toBeDefined();
    const previous = dirs().find((dir) => dir.endsWith("_deliverable_overrides")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql : deux tables, quatre valeurs d'enum, aucune valeur utilisée, reviews_immutable intact", () => {
    const up = code(sqlOf("migration.sql"));
    expect(up.match(/CREATE\s+TABLE/gi)).toHaveLength(2);
    for (const value of ["flow", "rules", "roles", "deliverable"]) {
      expect(up).toContain(`ALTER TYPE "review_target_kind" ADD VALUE '${value}'`);
    }
    expect(up).not.toMatch(/'(flow|rules|roles|deliverable)'::review_target_kind/);
    expect(up).not.toMatch(/ON "reviews"|ALTER TABLE "reviews"|TRIGGER "reviews_no/);
  });

  it("down.sql retire les deux tables et recrée le type sans les quatre valeurs", () => {
    const down = code(sqlOf("down.sql"));
    expect(down).toMatch(/DROP TABLE (?:IF EXISTS )?(?:"public"\.)?"review_versions"/i);
    expect(down).toMatch(/DROP TABLE (?:IF EXISTS )?(?:"public"\.)?"spec_entities"/i);
    expect(down).toMatch(/CREATE TYPE "?(?:public"?\.)?"?review_target_kind"? AS ENUM/i);
  });

  it("expectedTables contient les deux tables (63 au total) ; ce sont des modèles d'organisation", () => {
    expect(expectedTables).toContain("spec_entities");
    expect(expectedTables).toContain("review_versions");
    expect(expectedTables).toHaveLength(63);
    expect(dbPackage.TENANT_MODELS).toContain("SpecEntity");
    expect(dbPackage.TENANT_MODELS).toContain("ReviewVersion");
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

async function inventory(target: TestDatabase) {
  const rows = async (sql: string) =>
    (await target.query<{ name: string }>(sql)).map((r) => r.name);
  return {
    tables: await rows(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' ORDER BY 1`,
    ),
    columns: await rows(
      `SELECT table_name || '.' || column_name || ' ' || udt_name || ' null=' || is_nullable
              || ' default=' || coalesce(column_default, '-') AS name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' ORDER BY 1`,
    ),
    enums: await rows(
      `SELECT t.typname || ':' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS name
       FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' GROUP BY t.typname ORDER BY 1`,
    ),
    functions: await rows(
      `SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' ORDER BY 1`,
    ),
    triggers: await rows("SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1"),
    indexes: await rows(
      `SELECT indexname || ' ' || indexdef AS name FROM pg_indexes
       WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY 1`,
    ),
    constraints: await rows(
      `SELECT cl.relname || '.' || con.conname || ' ' || pg_get_constraintdef(con.oid) AS name
       FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       WHERE n.nspname = 'public' AND cl.relname <> '_prisma_migrations' ORDER BY 1`,
    ),
  };
}

describe("TK-100 migration spec_entities : up, down, up", () => {
  let afterFirstUp: Awaited<ReturnType<typeof inventory>>;

  it("deploy crée les tables, étend l'enum, ajoute le marqueur et garde reviews_immutable", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    afterFirstUp = await inventory(db);
    expect(afterFirstUp.tables).toEqual([...expectedTables].sort());
    expect(afterFirstUp.enums).toContain(
      "review_target_kind:feature,screen,baseline,flow,rules,roles,deliverable",
    );
    expect(
      afterFirstUp.columns.some((c) =>
        c.startsWith("spec_snapshots.entities_indexed_at timestamptz null=YES"),
      ),
    ).toBe(true);
    expect(afterFirstUp.triggers).toContain("reviews_no_update_delete");
    expect(
      afterFirstUp.indexes.some((i) =>
        /UNIQUE INDEX spec_entities_snapshot_id_kind_spec_id_key.*\(snapshot_id, kind, spec_id\)/.test(
          i,
        ),
      ),
    ).toBe(true);
    expect(
      afterFirstUp.indexes.some((i) =>
        /spec_entities_snapshot_id_kind_sort_id_idx.*\(snapshot_id, kind, sort, id\)/.test(i),
      ),
    ).toBe(true);
  }, 180_000);

  it("down.sql ramène exactement à l'état précédent", async () => {
    for (const dir of dirs().filter((d) => d < migration())) {
      runPrismaOrThrow(
        ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
        baseline.url,
      );
    }
    const expected = await inventory(baseline);
    for (const dir of dirs()
      .filter((d) => d >= migration())
      .reverse()) {
      runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }
    expect(await inventory(db)).toEqual(expected);
  }, 180_000);

  it("second deploy : même inventaire", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    expect(await inventory(db)).toEqual(afterFirstUp);
  }, 180_000);

  it("migrate diff entre la base et schema.prisma est vide (code 0)", () => {
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 120_000);
});
