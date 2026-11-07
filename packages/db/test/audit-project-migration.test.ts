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
import { insertScope, insertSprint, insertTicket, type Scope } from "./support/ticket-fixtures.ts";

/**
 * TK-96 : migration `*_audit_project` (colonne `audit_log.project_id`, index, rattrapage des lignes
 * existantes). Les procédures de pilotage reçoivent `projectId` : le journal doit pouvoir être lu par
 * projet. Colonne nullable (NULL = écriture d'organisation), sans clé étrangère (journal append-only).
 */
const SUFFIX = "_audit_project";
const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, migration(), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");
const INDEX = "audit_log_organization_id_project_id_occurred_at_idx";

describe("TK-96 migration audit_project : dossier et contenu", () => {
  it("existe, après 20261107090000_ai_providers, avec un down.sql non vide", () => {
    expect(migration(), "dossier de migration *_audit_project").toBeDefined();
    const previous = dirs().find((dir) => dir.endsWith("_ai_providers")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql ajoute une colonne nullable sans clé étrangère, un index, et rattrape les lignes", () => {
    const up = code(sqlOf("migration.sql"));
    expect(up).toMatch(/ADD\s+COLUMN\s+"project_id"\s+UUID\s*;/i);
    expect(up).not.toMatch(/NOT\s+NULL/i);
    expect(up).not.toMatch(/REFERENCES/i);
    expect(up).toContain(INDEX);
    expect(up).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(up).not.toMatch(/\b(?:DELETE\s+FROM|TRUNCATE)\b/i);
    // Le déclencheur d'immuabilité est suspendu puis rétabli autour du seul rattrapage.
    const disable = up.search(/DISABLE\s+TRIGGER\s+"audit_log_no_update_delete"/i);
    const enable = up.search(/ENABLE\s+TRIGGER\s+"audit_log_no_update_delete"/i);
    expect(disable).toBeGreaterThan(-1);
    expect(enable).toBeGreaterThan(disable);
  });

  it("down.sql retire l'index puis la colonne, sans toucher aux lignes", () => {
    const down = code(sqlOf("down.sql"));
    expect(down).toMatch(/DROP\s+INDEX/i);
    expect(down).toMatch(/DROP\s+COLUMN\s+"project_id"/i);
    expect(down).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|TRUNCATE/i);
  });
});

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 180_000);

afterAll(async () => {
  await db?.dispose();
}, 60_000);

const insertAudit = (
  scope: Scope,
  over: { targetKind: string; targetId: string; ticketId?: string | null },
) =>
  db.query(
    `INSERT INTO audit_log (id, organization_id, actor_kind, action, target_kind, target_id, ticket_id, occurred_at)
     VALUES ($1, $2, 'human', 'x.y', $3, $4, $5, now())`,
    [randomUUID(), scope.organizationId, over.targetKind, over.targetId, over.ticketId ?? null],
  );

const projectsOf = async (targetKind: string) =>
  (
    await db.query<{ project_id: string | null }>(
      "SELECT project_id FROM audit_log WHERE target_kind = $1",
      [targetKind],
    )
  ).map((r) => r.project_id);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-96 migration audit_project : up -> (données) -> down -> up", () => {
  let scope: Scope;

  it("deploy sur base vide ajoute la colonne project_id (nullable) et son index", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const [column] = await db.query<{ is_nullable: string; udt_name: string }>(
      `SELECT is_nullable, udt_name FROM information_schema.columns
       WHERE table_name = 'audit_log' AND column_name = 'project_id'`,
    );
    expect(column).toEqual({ is_nullable: "YES", udt_name: "uuid" });
    const indexes = await db.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'audit_log'",
    );
    expect(indexes.map((i) => i.indexname)).toContain(INDEX);
  }, 180_000);

  it("down.sql retire la colonne et l'index ; les lignes d'audit survivent", async () => {
    scope = await insertScope(db, "audit-project");
    const ticketId = await insertTicket(db, scope, { key: "TK-1" });
    await insertAudit(scope, { targetKind: "ticket", targetId: ticketId, ticketId });
    const downs = dirs()
      .filter((d) => d >= migration())
      .reverse();
    for (const dir of downs) {
      runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }
    const columns = await db.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'project_id'",
    );
    expect(columns).toEqual([]);
    expect(await db.query("SELECT 1 FROM audit_log")).toHaveLength(1);
  }, 180_000);

  it("second deploy : le rattrapage pose le projet des lignes existantes, NULL pour les autres", async () => {
    const ticketId = (await db.query<{ id: string }>("SELECT id FROM tickets"))[0]?.id as string;
    const sprintId = await insertSprint(db, scope, { number: 1 });
    await insertAudit(scope, { targetKind: "sprint", targetId: sprintId });
    await insertAudit(scope, { targetKind: "organization", targetId: randomUUID() });
    expect(ticketId).toBeDefined();

    runPrismaOrThrow(["migrate", "deploy"], db.url);

    expect(await projectsOf("ticket")).toEqual([scope.projectId]);
    expect(await projectsOf("sprint")).toEqual([scope.projectId]);
    expect(await projectsOf("organization")).toEqual([null]);
  }, 180_000);

  it("le déclencheur d'immuabilité est rétabli : UPDATE et DELETE restent refusés", async () => {
    await expect(db.query("UPDATE audit_log SET action = 'z'")).rejects.toThrow(/append-only/);
    await expect(db.query("DELETE FROM audit_log")).rejects.toThrow(/append-only/);
  });

  it("migrate diff entre la base et schema.prisma est vide (code 0)", () => {
    const { status, output } = runPrisma(
      ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath, "--exit-code"],
      db.url,
    );
    expect(status, output).toBe(0);
  }, 120_000);
});
