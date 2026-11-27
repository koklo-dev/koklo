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
import { reviewScope } from "./support/reviews-fixtures.ts";
import { sqlState } from "./support/ticket-fixtures.ts";

/**
 * TK-116 lot A (cas 7, B777) : migration `20261127140000_comment_operation_targets` : valeurs d'enum `operation` et
 * `requirements`. `down.sql` supprime ces seuls commentaires et recrée le type (up, down, up), `migrate diff` vide.
 */
const NAME = "20261127140000_comment_operation_targets";
const dirs = () => listMigrationDirs();
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, NAME, file), "utf8").replace(/--.*$/gm, "");

describe("TK-116 migration comment_operation_targets : dossier et contenu", () => {
  it("existe après 20261127130000_comment_technical_targets, avec un down.sql", () => {
    expect(dirs()).toContain(NAME);
    const previous = dirs().indexOf("20261127130000_comment_technical_targets");
    expect(dirs().indexOf(NAME)).toBeGreaterThan(previous);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql : additive (deux valeurs d'enum), sans suppression ni ligne modifiée", () => {
    const up = sqlOf("migration.sql");
    for (const value of ["operation", "requirements"]) {
      expect(up).toMatch(new RegExp(`ADD VALUE '${value}'`));
    }
    expect(up).not.toMatch(/DROP|DELETE|UPDATE|INSERT/i);
  });

  it("down.sql retire les commentaires des deux cibles puis recrée l'enum précédent", () => {
    const down = sqlOf("down.sql");
    expect(down).toMatch(
      /DELETE FROM "public"\."ticket_comments" WHERE "target_kind"::text IN \('operation', 'requirements'\)/,
    );
    expect(down).toMatch(
      /AS ENUM \('ticket', 'feature', 'screen', 'change_request', 'table', 'component', 'adr', 'archflow', 'stack', 'environments', 'tech_section'\)/,
    );
  });
});

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 180_000);

afterAll(async () => {
  await db?.dispose();
}, 60_000);

const comment = (scope: { organizationId: string }, kind: string, targetRef: string) =>
  db.query(
    `INSERT INTO ticket_comments (id, organization_id, target_kind, target_id, target_ref, author_kind, author_id, body, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2::comment_target_kind, $3, $4, 'client', 'u', 'x', now(), now())`,
    [scope.organizationId, kind, randomUUID(), targetRef],
  );

const targets = async () =>
  (await db.query<{ ref: string }>("SELECT target_ref AS ref FROM ticket_comments ORDER BY 1")).map(
    (row) => row.ref,
  );

describe("TK-116 migration comment_operation_targets : up, down, up", () => {
  it("deploy, retour arrière (autres cibles gardées), second deploy, migrate diff vide", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const scope = await reviewScope(db, "comment-op");
    await comment(scope, "operation", "reservation.create");
    await comment(scope, "requirements", "requirements");
    await comment(scope, "stack", "ST-sms");
    expect(await sqlState(() => comment(scope, "layout", "x"))).toBe("22P02");
    for (const dir of dirs()
      .filter((d) => d >= NAME)
      .reverse()) {
      runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }
    expect(await targets()).toEqual(["ST-sms"]);
    expect(await sqlState(() => comment(scope, "operation", "a.b"))).toBe("22P02");
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    expect(await sqlState(() => comment(scope, "operation", "a.b"))).toBeUndefined();
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 180_000);

  it("schema.prisma déclare les deux cibles", () => {
    const schema = readFileSync(schemaPath, "utf8");
    for (const value of ["operation", "requirements"]) {
      expect(schema).toMatch(new RegExp(`enum CommentTargetKind \\{[^}]*\\b${value}\\b[^}]*\\}`));
    }
  });
});
