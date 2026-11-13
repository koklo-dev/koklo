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
import { reviewScope } from "./support/reviews-fixtures.ts";
import { sqlState } from "./support/ticket-fixtures.ts";

/**
 * TK-109 (lot A, B444) : migration `*_comment_table_target` : valeur d'enum `table`, colonne `target_ref`, index de lecture.
 * `down.sql` rejouable sans perdre un commentaire de ticket (up, down, up), `migrate diff` vide.
 */
const SUFFIX = "_comment_table_target";
const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, migration(), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

describe("TK-109 migration comment_table_target : dossier et contenu", () => {
  it("existe, après 20261113100000_proposal_data_kinds, avec un down.sql non vide", () => {
    expect(migration(), "dossier de migration *_comment_table_target").toBeDefined();
    const previous = dirs().find((dir) => dir.endsWith("_proposal_data_kinds")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql : additive (valeur table, colonne target_ref, index), sans suppression", () => {
    const up = code(sqlOf("migration.sql"));
    expect(up).toMatch(/ADD VALUE 'table'/);
    expect(up).toMatch(/ADD COLUMN "target_ref" TEXT/);
    expect(up).toMatch(/CREATE INDEX[^;]*"target_kind", "target_id", "target_ref"/);
    expect(up).not.toMatch(/DROP|DELETE/i);
  });

  it("down.sql retire les commentaires de table puis recrée l'enum sans table", () => {
    const down = code(sqlOf("down.sql"));
    expect(down).toMatch(
      /DELETE FROM "public"\."ticket_comments" WHERE "target_kind"::text = 'table'/,
    );
    expect(down).toMatch(/DROP COLUMN "target_ref"/);
    expect(down).toMatch(
      /CREATE TYPE "public"\."comment_target_kind" AS ENUM \('ticket', 'feature', 'screen', 'change_request'\)/,
    );
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

const columns = async (target: TestDatabase) =>
  (
    await target.query<{ name: string }>(
      `SELECT table_name || '.' || column_name || ' ' || udt_name AS name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ticket_comments' ORDER BY 1`,
    )
  ).map((row) => row.name);

const comment = (
  scope: { organizationId: string },
  kind: string,
  targetId: string,
  targetRef: string | null,
) =>
  db.query(
    `INSERT INTO ticket_comments (id, organization_id, target_kind, target_id, target_ref, author_kind, author_id, body, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2::comment_target_kind, $3, $4, 'client', 'u', 'x', now(), now())`,
    [scope.organizationId, kind, targetId, targetRef],
  );

describe("TK-109 migration comment_table_target : up, down, up", () => {
  it("deploy : target_kind accepte table avec target_ref, refuse toujours une valeur inconnue", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const scope = await reviewScope(db, "comment-up");
    const target = crypto.randomUUID();
    expect(await sqlState(() => comment(scope, "table", target, "T-clients"))).toBeUndefined();
    expect(await sqlState(() => comment(scope, "ticket", target, null))).toBeUndefined();
    expect(await sqlState(() => comment(scope, "layout", target, null))).toBe("22P02");
  }, 180_000);

  it("down.sql ramène exactement au schéma précédent, retire les tables et garde les tickets", async () => {
    for (const dir of dirs().filter((d) => d < migration())) {
      runPrismaOrThrow(
        ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
        baseline.url,
      );
    }
    const expected = await columns(baseline);
    const scope = await reviewScope(db, "comment-keep");
    await comment(scope, "table", crypto.randomUUID(), "T-clients");
    await comment(scope, "ticket", crypto.randomUUID(), null);
    for (const dir of dirs()
      .filter((d) => d >= migration())
      .reverse()) {
      runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }
    expect(await columns(db)).toEqual(expected);
    expect(
      await db.query("SELECT 1 FROM ticket_comments WHERE target_kind::text = 'table'"),
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "SELECT 1 FROM ticket_comments WHERE target_kind = 'ticket' AND organization_id = $1",
          [scope.organizationId],
        )
      ).length,
    ).toBeGreaterThan(0);
  }, 180_000);

  it("second deploy : colonne et valeur de retour, migrate diff vide (code 0)", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const scope = await reviewScope(db, "comment-again");
    expect(
      await sqlState(() => comment(scope, "table", crypto.randomUUID(), "T-a")),
    ).toBeUndefined();
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 180_000);
});
