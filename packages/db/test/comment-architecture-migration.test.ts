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
 * TK-113 (lot A) : migration `*_comment_architecture_targets` : valeurs d'enum `component`, `adr`, `archflow` (B575 à B592).
 * `down.sql` supprime les commentaires de ces cibles, garde ceux des tickets et des tables, recrée le type (up, down, up).
 */
const SUFFIX = "_comment_architecture_targets";
const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, migration(), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

describe("TK-113 migration comment_architecture_targets : dossier et contenu", () => {
  it("existe, après 20261114120000_architecture_launch_modes, avec un down.sql non vide", () => {
    expect(migration(), "dossier de migration *_comment_architecture_targets").toBeDefined();
    const previous = dirs().find((dir) => dir.endsWith("_architecture_launch_modes")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql : additive (trois valeurs d'enum), sans suppression", () => {
    const up = code(sqlOf("migration.sql"));
    for (const value of ["component", "adr", "archflow"]) {
      expect(up).toMatch(new RegExp(`ADD VALUE '${value}'`));
    }
    expect(up).not.toMatch(/DROP|DELETE/i);
  });

  it("down.sql retire les commentaires des nouvelles cibles puis recrée l'enum", () => {
    const down = code(sqlOf("down.sql"));
    expect(down).toMatch(
      /DELETE FROM "public"\."ticket_comments" WHERE "target_kind"::text IN \('component', 'adr', 'archflow'\)/,
    );
    expect(down).toMatch(
      /CREATE TYPE "public"\."comment_target_kind" AS ENUM \('ticket', 'feature', 'screen', 'change_request', 'table'\)/,
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

describe("TK-113 migration comment_architecture_targets : up, down, up", () => {
  it("deploy : target_kind accepte component, adr et archflow, refuse toujours une valeur inconnue", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const scope = await reviewScope(db, "comment-arch-up");
    const target = crypto.randomUUID();
    expect(await sqlState(() => comment(scope, "component", target, "C-api"))).toBeUndefined();
    expect(await sqlState(() => comment(scope, "adr", target, "ADR-001"))).toBeUndefined();
    expect(await sqlState(() => comment(scope, "archflow", target, "P-signup"))).toBeUndefined();
    expect(await sqlState(() => comment(scope, "layout", target, null))).toBe("22P02");
  }, 180_000);

  it("down.sql ramène exactement au schéma précédent, retire les cibles d'architecture et garde le reste", async () => {
    for (const dir of dirs().filter((d) => d < migration())) {
      runPrismaOrThrow(
        ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
        baseline.url,
      );
    }
    const expected = await columns(baseline);
    const scope = await reviewScope(db, "comment-arch-keep");
    await comment(scope, "component", crypto.randomUUID(), "C-api");
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
      await db.query(
        "SELECT 1 FROM ticket_comments WHERE target_kind::text IN ('component', 'adr', 'archflow')",
      ),
    ).toHaveLength(0);
    for (const kind of ["ticket", "table"]) {
      const kept = await db.query(
        "SELECT 1 FROM ticket_comments WHERE target_kind::text = $1 AND organization_id = $2",
        [kind, scope.organizationId],
      );
      expect(kept.length, kind).toBeGreaterThan(0);
    }
  }, 180_000);

  it("second deploy : valeurs de retour, migrate diff vide (code 0)", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const scope = await reviewScope(db, "comment-arch-again");
    expect(
      await sqlState(() => comment(scope, "archflow", crypto.randomUUID(), "P-a")),
    ).toBeUndefined();
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 180_000);
});
