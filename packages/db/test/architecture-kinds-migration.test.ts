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
import { reviewScope } from "./support/reviews-fixtures.ts";
import { insertSnapshot } from "./support/spec-fixtures.ts";
import { sqlState } from "./support/ticket-fixtures.ts";

/**
 * TK-111 lot A : migrations `*_architecture_entity_kinds` (`spec_entities_kind_check` accepte component, archflow, adr) et
 * `*_architecture_proposal_kinds` (`agent_proposals_kind_check` accepte component, archflow, adr, doc_section). Additives ;
 * `down.sql` rejouables (up, down, up), `migrate diff` vide.
 */
const ENTITY = "_architecture_entity_kinds";
const PROPOSAL = "_architecture_proposal_kinds";
const dirs = () => listMigrationDirs();
const named = (suffix: string) => dirs().find((dir) => dir.endsWith(suffix)) as string;
const sqlOf = (suffix: string, file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, named(suffix), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

describe("TK-111 migrations architecture : dossiers et contenu", () => {
  it("existent, après 20261113110000_comment_table_target, chacune avec un down.sql non vide", () => {
    const previous = dirs().find((dir) => dir.endsWith("_comment_table_target")) as string;
    for (const suffix of [ENTITY, PROPOSAL]) {
      expect(named(suffix), `dossier *${suffix}`).toBeDefined();
      expect(named(suffix) > previous).toBe(true);
      expect(sqlOf(suffix, "down.sql").trim().length).toBeGreaterThan(0);
    }
    expect(named(PROPOSAL) > named(ENTITY)).toBe(true);
  });

  it("entités : CHECK refait avec component, archflow, adr, sans table ni fonction ; down les retire", () => {
    const up = code(sqlOf(ENTITY, "migration.sql"));
    expect(up).toMatch(/DROP CONSTRAINT "spec_entities_kind_check"/);
    expect(up).toMatch(
      /ADD CONSTRAINT "spec_entities_kind_check" CHECK[^;]*'component'[^;]*'archflow'[^;]*'adr'/,
    );
    expect(up).not.toMatch(/CREATE\s+(?:TABLE|FUNCTION|TRIGGER)/i);
    const down = code(sqlOf(ENTITY, "down.sql"));
    expect(down).toMatch(/DELETE FROM "public"\."spec_entities" WHERE "kind" IN/);
    expect(down).not.toMatch(/ADD CONSTRAINT "spec_entities_kind_check" CHECK[^;]*'component'/);
  });

  it("propositions : CHECK refait avec les quatre types ; down retire leurs propositions", () => {
    const up = code(sqlOf(PROPOSAL, "migration.sql"));
    expect(up).toMatch(/DROP CONSTRAINT "agent_proposals_kind_check"/);
    expect(up).toMatch(
      /ADD CONSTRAINT "agent_proposals_kind_check" CHECK[^;]*'component'[^;]*'archflow'[^;]*'adr'[^;]*'doc_section'/,
    );
    expect(up).not.toMatch(/CREATE\s+(?:TABLE|FUNCTION|TRIGGER)/i);
    const down = code(sqlOf(PROPOSAL, "down.sql"));
    expect(down).toMatch(/DELETE FROM "public"\."agent_proposals" WHERE "kind" IN/);
    expect(down).not.toMatch(/ADD CONSTRAINT "agent_proposals_kind_check" CHECK[^;]*'doc_section'/);
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

const entity = (scope: { organizationId: string }, snapshotId: string, kind: string) =>
  db.query(
    `INSERT INTO spec_entities (id, organization_id, snapshot_id, kind, spec_id, zone, path, data, content_hash, sort, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'architecture', 'architecture/x.yaml', '{"nom":"x"}'::jsonb, $5, 1, now(), now())`,
    [scope.organizationId, snapshotId, kind, `X-${kind}`, "a".repeat(64)],
  );

interface Scope {
  organizationId: string;
  projectId: string;
  userId: string;
}

async function proposal(scope: Scope, kind: string, launchId?: string) {
  const launch = launchId ?? randomUUID();
  if (launchId === undefined) {
    await db.query(
      `INSERT INTO agent_launches (id, organization_id, project_id, deliverable, mode, status, requested_by, sources, updated_at)
       VALUES ($1, $2, $3, 'architecture', 'complete', 'done', $4, '["functional.features"]'::jsonb, now())`,
      [launch, scope.organizationId, scope.projectId, scope.userId],
    );
  }
  await db.query(
    `INSERT INTO agent_proposals (id, organization_id, project_id, launch_id, deliverable, kind, zone, position, title, rationale, payload, status, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'architecture', $4, 'Noyau', 0, 'Titre', 'Raison', '{}'::jsonb, 'pending', now())`,
    [scope.organizationId, scope.projectId, launch, kind],
  );
  return launch;
}

describe("TK-111 migrations architecture : up, down, up", () => {
  it("deploy : les trois genres d'entité et les quatre types de proposition sont acceptés, un inconnu reste refusé", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const review = await reviewScope(db, "arch-up");
    const snapshot = await insertSnapshot(db, review, review.repoId);
    for (const kind of ["component", "archflow", "adr"]) {
      expect(await sqlState(() => entity(review, snapshot, kind)), kind).toBeUndefined();
    }
    expect(await sqlState(() => entity(review, snapshot, "layout"))).toBe("23514");
    const scope = await notificationScope(db, "arch-up");
    const launch = await proposal(scope, "component");
    for (const kind of ["archflow", "adr", "doc_section"]) {
      expect(await sqlState(() => proposal(scope, kind, launch)), kind).toBeUndefined();
    }
    expect(await sqlState(() => proposal(scope, "dessin", launch))).toBe("23514");
  }, 180_000);

  it("down.sql ramène exactement à l'état précédent et retire les lignes des nouveaux genres", async () => {
    for (const dir of dirs().filter((d) => d < named(ENTITY))) {
      runPrismaOrThrow(
        ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
        baseline.url,
      );
    }
    const expected = await constraints(baseline);
    const review = await reviewScope(db, "arch-keep");
    const snapshot = await insertSnapshot(db, review, review.repoId);
    await entity(review, snapshot, "table");
    await entity(review, snapshot, "component");
    const scope = await notificationScope(db, "arch-keep");
    const launch = await proposal(scope, "feature");
    await proposal(scope, "doc_section", launch);
    for (const dir of dirs()
      .filter((d) => d >= named(ENTITY))
      .reverse()) {
      runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }
    expect(await constraints(db)).toEqual(expected);
    expect(await db.query("SELECT 1 FROM spec_entities WHERE kind = 'component'")).toHaveLength(0);
    expect(await db.query("SELECT 1 FROM spec_entities WHERE kind = 'table'")).toHaveLength(1);
    expect(await db.query("SELECT 1 FROM agent_proposals WHERE kind = 'doc_section'")).toHaveLength(
      0,
    );
    expect(await db.query("SELECT 1 FROM agent_proposals WHERE kind = 'feature'")).toHaveLength(1);
  }, 180_000);

  it("second deploy : mêmes contraintes qu'au premier, migrate diff vide (code 0)", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 180_000);
});
