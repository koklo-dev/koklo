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
 * TK-100 (lot A) : migration `*_deliverable_overrides` : forçage de l'ouverture d'un livrable (owner, admin), une ligne par
 * projet et livrable. Additive : une table, sans enum, fonction ni trigger. `down.sql` rejouable, `migrate diff` vide.
 */
const SUFFIX = "_deliverable_overrides";
const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, migration(), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

describe("TK-100 migration deliverable_overrides : dossier et contenu", () => {
  it("existe, après 20261111090000_agent_proposals, avec un down.sql non vide", () => {
    expect(migration(), "dossier de migration *_deliverable_overrides").toBeDefined();
    const previous = dirs().find((dir) => dir.endsWith("_agent_proposals")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql : une table, clé unique (projet, livrable), CHECK sur la clé, sans enum ni fonction ni trigger", () => {
    const up = code(sqlOf("migration.sql"));
    expect(up.match(/CREATE\s+TABLE/gi)).toHaveLength(1);
    expect(up).toContain('CREATE TABLE "deliverable_overrides"');
    expect(up).toMatch(
      /CREATE UNIQUE INDEX "deliverable_overrides_project_id_deliverable_key" ON "deliverable_overrides"\("project_id", "deliverable"\)/,
    );
    expect(up).toContain("deliverable_overrides_deliverable_check");
    expect(up).not.toMatch(/CREATE\s+TYPE|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|CREATE\s+TRIGGER/i);
  });

  it("down.sql retire la table", () => {
    expect(code(sqlOf("down.sql"))).toMatch(
      /DROP TABLE (?:IF EXISTS )?(?:"public"\.)?"deliverable_overrides"/i,
    );
  });

  it("expectedTables contient la table (63 au total) ; le modèle est un modèle d'organisation", () => {
    expect(expectedTables).toContain("deliverable_overrides");
    expect(expectedTables).toHaveLength(63);
    expect(dbPackage.TENANT_MODELS).toContain("DeliverableOverride");
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

describe("TK-100 migration deliverable_overrides : up, down, up", () => {
  let afterFirstUp: Awaited<ReturnType<typeof inventory>>;

  it("deploy crée la table, la clé unique et la clé étrangère composite en cascade", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    afterFirstUp = await inventory(db);
    expect(afterFirstUp.tables).toEqual([...expectedTables].sort());
    const keys = afterFirstUp.constraints.filter((c) => c.startsWith("deliverable_overrides."));
    expect(
      keys.some((c) =>
        c.includes(
          "FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id) ON DELETE CASCADE",
        ),
      ),
      keys.join("\n"),
    ).toBe(true);
    expect(
      afterFirstUp.indexes.some((i) =>
        /UNIQUE INDEX deliverable_overrides_project_id_deliverable_key.*\(project_id, deliverable\)/.test(
          i,
        ),
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
