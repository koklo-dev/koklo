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
 * TK-111 lot B : migration `*_architecture_launch_modes` (`agent_launches_mode_check` accepte `decision` et `document`).
 * Additive ; `down.sql` rejouable (up, down, up), `migrate diff` vide.
 */
const SUFFIX = "_architecture_launch_modes";
const dirs = () => listMigrationDirs();
const named = () => dirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, named(), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

describe("TK-111 migration modes de lancement : dossier et contenu", () => {
  it("existe, après 20261114110000_adr_counter, avec un down.sql non vide", () => {
    const previous = dirs().find((dir) => dir.endsWith("_adr_counter")) as string;
    expect(named(), `dossier *${SUFFIX}`).toBeDefined();
    expect(named() > previous).toBe(true);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("CHECK refait avec decision et document, sans table ni fonction ; down retire les lancements des deux modes", () => {
    const up = code(sqlOf("migration.sql"));
    expect(up).toMatch(/DROP CONSTRAINT "agent_launches_mode_check"/);
    expect(up).toMatch(
      /ADD CONSTRAINT "agent_launches_mode_check" CHECK[^;]*'decision'[^;]*'document'/,
    );
    expect(up).not.toMatch(/CREATE\s+(?:TABLE|FUNCTION|TRIGGER)/i);
    const down = code(sqlOf("down.sql"));
    expect(down).toMatch(/DELETE FROM "public"\."agent_launches" WHERE "mode" IN/);
    expect(down).not.toMatch(/ADD CONSTRAINT "agent_launches_mode_check" CHECK[^;]*'document'/);
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

interface Scope {
  organizationId: string;
  projectId: string;
  userId: string;
}

/** Lancement terminé du mode donné (terminé : l'index unique partiel n'autorise qu'un lancement actif par livrable). */
const launch = (scope: Scope, mode: string) =>
  db.query(
    `INSERT INTO agent_launches (id, organization_id, project_id, deliverable, mode, status, requested_by, sources, updated_at)
     VALUES ($1, $2, $3, 'architecture', $4, 'done', $5, '["functional.features"]'::jsonb, now())`,
    [randomUUID(), scope.organizationId, scope.projectId, mode, scope.userId],
  );

describe("TK-111 migration modes de lancement : up, down, up", () => {
  it("deploy : decision et document sont acceptés, un mode inconnu reste refusé", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const scope = await notificationScope(db, "mode-up");
    for (const mode of ["complete", "criteria", "update", "all", "decision", "document"]) {
      expect(await sqlState(() => launch(scope, mode)), mode).toBeUndefined();
    }
    expect(await sqlState(() => launch(scope, "tout"))).toBe("23514");
  }, 180_000);

  it("down.sql ramène exactement à l'état précédent et retire les lancements des nouveaux modes", async () => {
    for (const dir of dirs().filter((d) => d < named())) {
      runPrismaOrThrow(
        ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
        baseline.url,
      );
    }
    const expected = await constraints(baseline);
    const scope = await notificationScope(db, "mode-keep");
    await launch(scope, "all");
    await launch(scope, "decision");
    runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, named(), "down.sql")], db.url);
    await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [named()]);
    expect(await constraints(db)).toEqual(expected);
    expect(await db.query("SELECT 1 FROM agent_launches WHERE mode = 'decision'")).toHaveLength(0);
    expect(
      await db.query("SELECT 1 FROM agent_launches WHERE mode = 'all' AND project_id = $1", [
        scope.projectId,
      ]),
    ).toHaveLength(1);
  }, 180_000);

  it("second deploy : mêmes contraintes qu'au premier, migrate diff vide (code 0)", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 180_000);
});
