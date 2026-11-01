import { randomUUID } from "node:crypto";
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
import { insertInstallation, insertRepo, sha } from "./support/spec-fixtures.ts";
import { insertScope } from "./support/ticket-fixtures.ts";

/**
 * TK-44a : migration additive `<horodatage>_spec_batch_outcome` (rapport, message, rôle de
 * l'auteur, valeur `feature` du compteur, CHECK de cohérence des lots) et sa réversibilité
 * exacte. Aucune table n'est ajoutée : `expectedTables` ne change pas.
 */
const SUFFIX = "_spec_batch_outcome";
const PREVIOUS = "_provider_spec_index";

const dirs = () => listMigrationDirs();
const outcomeMigration = () => dirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (dir: string, file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, dir, file), "utf8");
/** Instructions SQL sans les commentaires `--`. */
const code = (sql: string) => sql.replace(/--.*$/gm, "");

/** Inventaire complet : colonnes (type, nullabilité, défaut), valeurs d'énumération ordonnées, index, contraintes. */
async function inventory(db: TestDatabase) {
  const rows = async (sql: string) => (await db.query<{ name: string }>(sql)).map((r) => r.name);
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
    enumTypes: await rows(
      `SELECT t.typname AS name FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typtype = 'e' ORDER BY 1`,
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

/** Référence : les migrations antérieures à celle de TK-44a seules, appliquées à la main. */
async function applyEarlierMigrations(target: TestDatabase): Promise<TestDatabase> {
  for (const dir of dirs().filter((d) => d < outcomeMigration())) {
    runPrismaOrThrow(
      ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
      target.url,
    );
  }
  return target;
}

/** Un lot validé (avec les nouvelles colonnes) et des compteurs ticket et feature, avant le down. */
async function seedExistingData(db: TestDatabase, batchId: string) {
  const scope = await insertScope(db, "outcome-migration");
  const repo = await insertRepo(db, scope, await insertInstallation(db, scope), { role: "spec" });
  await db.query(
    `INSERT INTO spec_write_batches (id, organization_id, project_id, repo_id, branch, idempotency_key,
       commit_sha, status, report, message, author_role, enqueued_at, committed_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'cadrage', 'k-1', $5, 'committed', '{"issues":[]}'::jsonb, 'spec: x', 'dev',
       now(), now(), now(), now())`,
    [batchId, scope.organizationId, scope.projectId, repo, sha()],
  );
  for (const [name, value] of [
    ["ticket", 3],
    ["feature", 7],
  ] as const) {
    await db.query(
      `INSERT INTO project_counters (organization_id, project_id, name, last_value, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())`,
      [scope.organizationId, scope.projectId, name, value],
    );
  }
  return scope;
}

/** TK-45a : les migrations postérieures sont défaites d'abord (ordre inverse), puis celle de TK-44a. */
async function rollBackOutcome(db: TestDatabase): Promise<void> {
  for (const dir of dirs()
    .filter((d) => d >= outcomeMigration())
    .reverse()) {
    runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
    await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
  }
}

/** Le lot tel que la base le rend : colonnes de statut et, si elles existent, celles de TK-44a. */
async function batchRow(db: TestDatabase, id: string) {
  const columns = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'spec_write_batches' AND column_name IN ('report', 'message', 'author_role')`,
  );
  const extra = columns.map((c) => `, ${c.column_name}`).join("");
  const [row] = await db.query<Record<string, unknown>>(
    `SELECT status${extra} FROM spec_write_batches WHERE id = $1`,
    [id],
  );
  return row;
}

const counterRows = (db: TestDatabase, projectId: string) =>
  db.query<{ name: string; last_value: number }>(
    "SELECT name::text AS name, last_value FROM project_counters WHERE project_id = $1 ORDER BY name::text",
    [projectId],
  );

function expectOutcomeSchema(state: Awaited<ReturnType<typeof inventory>>): void {
  expect(state.tables).toEqual([...expectedTables].sort());
  expect(state.columns).toEqual(
    expect.arrayContaining([
      "spec_write_batches.report jsonb null=YES default=-",
      "spec_write_batches.message text null=YES default=-",
      "spec_write_batches.author_role text null=YES default=-",
    ]),
  );
  expect(state.enums).toContain("counter_name:ticket,sprint,feature,suggestion");
}

describe("TK-44a migration spec_batch_outcome : dossier et contenu", () => {
  it("existe, suit la migration TK-41 et a un down.sql non vide", () => {
    const previous = dirs().find((dir) => dir.endsWith(PREVIOUS)) as string;

    expect(outcomeMigration(), "dossier de migration *_spec_batch_outcome").toBeDefined();
    expect(outcomeMigration()).toMatch(/^\d{14}_spec_batch_outcome$/);
    expect(outcomeMigration() > previous).toBe(true);
    expect(sqlOf(outcomeMigration(), "down.sql").trim().length).toBeGreaterThan(0);
  });

  it("est additive : aucun DROP dans migration.sql", () => {
    const up = code(sqlOf(outcomeMigration(), "migration.sql"));

    expect(up).not.toMatch(/\bDROP\b/i);
    expect(up).toMatch(/\breport\b/);
    expect(up).toMatch(/\bmessage\b/);
    expect(up).toMatch(/\bauthor_role\b/);
    expect(up).toMatch(/'feature'/);
  });

  it("ne crée aucune table (les 32 tables de TK-41 + 2 de TK-48a1 + 1 de TK-51a + 1 de TK-51b + 2 de TK-51c = 38 attendues au total)", () => {
    expect(code(sqlOf(outcomeMigration(), "migration.sql"))).not.toMatch(/CREATE\s+TABLE/i);
    expect(expectedTables).toContain("spec_write_batches");
    expect(expectedTables).toHaveLength(38);
  });
});

describe("TK-44a migration spec_batch_outcome : up -> (données) -> down -> up", () => {
  let db: TestDatabase;
  let baseline: TestDatabase;
  let afterFirstUp: Awaited<ReturnType<typeof inventory>>;
  const ids = { batch: randomUUID(), scope: { organizationId: "", projectId: "" } };

  beforeAll(async () => {
    db = await createTestDatabase();
    baseline = await createTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await db?.dispose();
    await baseline?.dispose();
  }, 60_000);

  it("deploy sur base vide : colonnes ajoutées, valeur feature présente", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);

    afterFirstUp = await inventory(db);
    expectOutcomeSchema(afterFirstUp);
  }, 180_000);

  it("down.sql ramène exactement à l'état précédent, données existantes conservées", async () => {
    const expected = await inventory(await applyEarlierMigrations(baseline));
    const scope = await seedExistingData(db, ids.batch);
    ids.scope = scope;

    await rollBackOutcome(db);

    expect(await inventory(db)).toEqual(expected);
    expect((await batchRow(db, ids.batch))?.status).toBe("committed");
    expect(await counterRows(db, scope.projectId)).toEqual([{ name: "ticket", last_value: 3 }]);
  }, 180_000);

  it("second deploy : même inventaire qu'au premier up, lot conservé, colonnes vides", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);

    expect(await inventory(db)).toEqual(afterFirstUp);
    expect(await batchRow(db, ids.batch)).toEqual({
      status: "committed",
      report: null,
      message: null,
      author_role: null,
    });
    await db.query(
      `INSERT INTO project_counters (organization_id, project_id, name, last_value, created_at, updated_at)
       VALUES ($1, $2, 'feature', 0, now(), now())`,
      [ids.scope.organizationId, ids.scope.projectId],
    );
  }, 180_000);

  it("migrate diff entre la base et schema.prisma est vide (code 0)", () => {
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 120_000);
});
