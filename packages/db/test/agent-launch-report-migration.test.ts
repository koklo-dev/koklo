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
 * TK-114b lot A : migration `*_agent_launch_report` (bilan d'un lancement : zones, compteurs, motifs, couverture avant et après,
 * appels de couverture sans trou comblé, segment, `handoff_at`, `stop_reason`). Additive ; `down.sql` rejouable (up, down, up), `migrate diff` vide.
 */
const SUFFIX = "_agent_launch_report";
const COLUMNS = [
  "coverage_after",
  "coverage_before",
  "coverage_calls",
  "coverage_stalled",
  "discard_reasons",
  "handoff_at",
  "segment",
  "stop_reason",
  "zones",
  "zones_discarded",
  "zones_done",
];
const dirs = () => listMigrationDirs();
const named = () => dirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, named(), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

describe("TK-114b migration bilan du lancement : dossier et contenu", () => {
  it("existe, après *_comment_architecture_targets, avec un down.sql non vide", () => {
    const previous = dirs().find((dir) => dir.endsWith("_comment_architecture_targets")) as string;
    expect(named(), `dossier *${SUFFIX}`).toBeDefined();
    expect(named() > previous).toBe(true);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("additive : ADD COLUMN et CHECK seulement, sans DROP ni table ; down retire colonnes et contraintes", () => {
    const up = code(sqlOf("migration.sql"));
    expect(up).toMatch(/ADD COLUMN/);
    expect(up).not.toMatch(/\bDROP\b/i);
    expect(up).not.toMatch(/CREATE\s+(?:TABLE|FUNCTION|TRIGGER)/i);
    const down = code(sqlOf("down.sql"));
    expect(down).toMatch(/DROP CONSTRAINT/);
    for (const column of COLUMNS) expect(down, column).toContain(`"${column}"`);
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
       WHERE table_schema = 'public' AND table_name = 'agent_launches' ORDER BY 1`,
    )
  ).map((row) => row.name);

interface Scope {
  organizationId: string;
  projectId: string;
  userId: string;
}

/** Lancement terminé (l'index unique partiel n'admet qu'un lancement actif par livrable) ; rend son identifiant. */
const launch = async (scope: Scope): Promise<string> => {
  const id = randomUUID();
  await db.query(
    `INSERT INTO agent_launches (id, organization_id, project_id, deliverable, mode, status, requested_by, sources, updated_at)
     VALUES ($1, $2, $3, 'architecture', 'all', 'done', $4, '["functional.features"]'::jsonb, now())`,
    [id, scope.organizationId, scope.projectId, scope.userId],
  );
  return id;
};

/** Colonnes du bilan d'un lancement neuf reçoivent `assignment` (SQL) : le code d'erreur, `undefined` si accepté. */
const withReport = async (scope: Scope, assignment: string) => {
  const id = await launch(scope);
  return sqlState(() => db.query(`UPDATE agent_launches SET ${assignment} WHERE id = $1`, [id]));
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-114b migration bilan du lancement : up, down, up", () => {
  it("deploy : valeurs par défaut, bornes et motifs vérifiés par CHECK", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const scope = await notificationScope(db, "report-up");
    await launch(scope);
    const [row] = await db.query<Record<string, unknown>>(
      `SELECT zones, zones_done, zones_discarded, coverage_calls, coverage_stalled, segment, discard_reasons, coverage_before,
              coverage_after, handoff_at, stop_reason FROM agent_launches WHERE project_id = $1`,
      [scope.projectId],
    );
    expect(row).toEqual({
      zones: [],
      zones_done: 0,
      zones_discarded: 0,
      coverage_calls: 0,
      coverage_stalled: 0,
      segment: 0,
      discard_reasons: {},
      coverage_before: null,
      coverage_after: null,
      handoff_at: null,
      stop_reason: null,
    });
    const twelve = JSON.stringify(Array.from({ length: 12 }, (_, i) => `Zone ${i}`));
    const thirteen = JSON.stringify(Array.from({ length: 13 }, (_, i) => `Zone ${i}`));
    const accepted = [
      `zones = '${twelve}'::jsonb, zones_done = 12`,
      "zones_discarded = 12, coverage_calls = 30, coverage_stalled = 30, segment = 8",
      `discard_reasons = '{"truncated":1}'::jsonb, coverage_before = '{"features":{}}'::jsonb`,
      `coverage_after = '{}'::jsonb, handoff_at = now(), stop_reason = 'completed'`,
      "stop_reason = 'cap'",
      "stop_reason = 'deadline'",
      "stop_reason = 'cancelled'",
    ];
    for (const assignment of accepted) {
      expect(await withReport(scope, assignment), assignment).toBeUndefined();
    }
    const refused = [
      `zones = '${thirteen}'::jsonb`,
      `zones = '{}'::jsonb`,
      "zones_done = -1",
      "zones_done = 13",
      "zones_discarded = 13",
      "coverage_calls = 31",
      "coverage_stalled = 31",
      "coverage_stalled = -1",
      "segment = 9",
      "segment = -1",
      `discard_reasons = '[]'::jsonb`,
      `coverage_before = '[]'::jsonb`,
      `coverage_after = '1'::jsonb`,
      "stop_reason = 'autre'",
    ];
    for (const assignment of refused) {
      expect(await withReport(scope, assignment), assignment).toBe("23514");
    }
  }, 180_000);

  it("down.sql ramène exactement à l'état précédent, les lancements restent", async () => {
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
    for (const column of COLUMNS) expect(expectedColumns).not.toContain(column);
    expect(
      (await db.query("SELECT 1 FROM agent_launches WHERE deliverable = 'architecture'")).length,
    ).toBeGreaterThan(0);
  }, 180_000);

  it("second deploy : migrate diff vide (code 0)", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 180_000);
});
