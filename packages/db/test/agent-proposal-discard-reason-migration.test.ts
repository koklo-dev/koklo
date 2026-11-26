import { randomUUID } from "node:crypto";
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
import { notificationScope } from "./support/notifications-fixtures.ts";
import { sqlState } from "./support/ticket-fixtures.ts";

/**
 * TK-114g lot A (B697) : migration `*_agent_proposal_discard_reason` (motif d'écart `already_present`, seulement avec
 * `status = 'rejected'`). Additive ; `down.sql` rejouable (up, down, up), `migrate diff` vide.
 */
const SUFFIX = "_agent_proposal_discard_reason";
const CHECK = "23514";
const dirs = () => listMigrationDirs();
const named = () => dirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, named(), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

describe("TK-114g migration motif d'écart : dossier et contenu", () => {
  it("existe, après *_agent_launch_report, avec un down.sql non vide", () => {
    const previous = dirs().find((dir) => dir.endsWith("_agent_launch_report")) as string;
    expect(named(), `dossier *${SUFFIX}`).toBeDefined();
    expect(named() > previous).toBe(true);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("additive : ADD COLUMN et CHECK seulement ; down retire la colonne et ses contraintes", () => {
    const up = code(sqlOf("migration.sql"));
    expect(up).toMatch(/ADD COLUMN "discard_reason"/);
    expect(up).not.toMatch(/\bDROP\b|\bUPDATE\b|\bINSERT\b/i);
    expect(up).not.toMatch(/CREATE\s+(?:TABLE|FUNCTION|TRIGGER)/i);
    const down = code(sqlOf("down.sql"));
    expect(down).toMatch(/DROP CONSTRAINT/);
    expect(down).toContain(`DROP COLUMN "discard_reason"`);
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

const constraints = async (target: TestDatabase) =>
  (
    await target.query<{ name: string }>(
      `SELECT cl.relname || '.' || con.conname || ' ' || pg_get_constraintdef(con.oid) AS name
       FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       WHERE n.nspname = 'public' AND cl.relname <> '_prisma_migrations' ORDER BY 1`,
    )
  ).map((row) => row.name);

const columns = async (target: TestDatabase) =>
  (
    await target.query<{ name: string }>(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'agent_proposals' ORDER BY 1`,
    )
  ).map((row) => row.name);

interface Scope {
  organizationId: string;
  projectId: string;
  userId: string;
}

/** Lancement terminé puis une proposition `status` ; rend l'identifiant de la proposition. */
const proposal = async (scope: Scope, status: string): Promise<string> => {
  const launchId = randomUUID();
  await db.query(
    `INSERT INTO agent_launches (id, organization_id, project_id, deliverable, mode, status, requested_by, sources, updated_at)
     VALUES ($1, $2, $3, 'functional', 'complete', 'done', $4, '["idea.frozen"]'::jsonb, now())`,
    [launchId, scope.organizationId, scope.projectId, scope.userId],
  );
  const id = randomUUID();
  await db.query(
    `INSERT INTO agent_proposals (id, organization_id, project_id, launch_id, deliverable, kind, zone, position,
       title, rationale, payload, status, updated_at)
     VALUES ($1, $2, $3, $4, 'functional', 'feature', 'Réservations', 0, 'Annuler', 'Manque', '{}'::jsonb, $5, now())`,
    [id, scope.organizationId, scope.projectId, launchId, status],
  );
  return id;
};

/** Une proposition `status` reçoit `discard_reason = reason` : le code d'erreur, `undefined` si accepté. */
const discard = async (scope: Scope, status: string, reason: string) => {
  const id = await proposal(scope, status);
  return sqlState(() =>
    db.query("UPDATE agent_proposals SET discard_reason = $2 WHERE id = $1", [id, reason]),
  );
};

describe("TK-114g migration motif d'écart : up, down, up", () => {
  it("deploy : nul par défaut, already_present seulement sur une rejetée, toute autre valeur refusée", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const scope = await notificationScope(db, "discard-up");
    const id = await proposal(scope, "pending");
    const [row] = await db.query<{ discard_reason: string | null }>(
      "SELECT discard_reason FROM agent_proposals WHERE id = $1",
      [id],
    );
    expect(row?.discard_reason).toBeNull();
    expect(await discard(scope, "rejected", "already_present")).toBeUndefined();
    expect(await discard(scope, "pending", "already_present")).toBe(CHECK);
    expect(await discard(scope, "accepted", "already_present")).toBe(CHECK);
    expect(await discard(scope, "rejected", "autre")).toBe(CHECK);
    expect(await discard(scope, "rejected", "")).toBe(CHECK);
  }, 180_000);

  it("down.sql ramène exactement à l'état précédent, les propositions restent", async () => {
    for (const dir of dirs().filter((d) => d < named())) {
      runPrismaOrThrow(
        ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
        baseline.url,
      );
    }
    const expected = await constraints(baseline);
    const expectedColumns = await columns(baseline);
    runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, named(), "down.sql")], db.url);
    await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [named()]);
    expect(await constraints(db)).toEqual(expected);
    expect(await columns(db)).toEqual(expectedColumns);
    expect(expectedColumns).not.toContain("discard_reason");
    expect(
      (await db.query("SELECT 1 FROM agent_proposals WHERE status = 'rejected'")).length,
    ).toBeGreaterThan(0);
  }, 180_000);

  it("second deploy : migrate diff vide (code 0)", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 180_000);
});
