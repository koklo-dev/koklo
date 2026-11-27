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
 * TK-115 lot A (cas 5) : les cinq migrations du livrable Technique (genres d'entité, types de proposition, modes de
 * lancement, compteur `nfr`, cibles de commentaire). Additives ; `down.sql` rejouables (up, down, up), `migrate diff` vide.
 */
const SUFFIXES = [
  "_technical_entity_kinds",
  "_technical_proposal_kinds",
  "_technical_launch_modes",
  "_nfr_counter",
  "_comment_technical_targets",
] as const;
const dirs = () => listMigrationDirs();
const named = (suffix: string) => dirs().find((dir) => dir.endsWith(suffix)) as string;
const code = (suffix: string, file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, named(suffix), file), "utf8").replace(/--.*$/gm, "");

describe("TK-115 migrations technique : dossiers et contenu", () => {
  it("cinq dossiers 20261127…, ordonnés après le motif d'écart, chacun avec un down.sql", () => {
    let previous = named("_agent_proposal_discard_reason");
    for (const suffix of SUFFIXES) {
      expect(named(suffix), `dossier *${suffix}`).toMatch(/^20261127\d{6}_/);
      expect(named(suffix) > previous, suffix).toBe(true);
      expect(code(suffix, "down.sql").trim().length).toBeGreaterThan(0);
      previous = named(suffix);
    }
  });

  it("additives : ni table, ni fonction, ni déclencheur, ni ligne modifiée", () => {
    for (const suffix of SUFFIXES) {
      const up = code(suffix, "migration.sql");
      expect(up, suffix).not.toMatch(/CREATE\s+(?:TABLE|FUNCTION|TRIGGER)/i);
      expect(up, suffix).not.toMatch(/^\s*(?:DELETE|UPDATE|INSERT)\b/im);
      expect(up, suffix).not.toMatch(/DROP\s+(?:TABLE|COLUMN|TYPE)/i);
    }
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

const enums = async (target: TestDatabase) =>
  (
    await target.query<{ name: string }>(
      `SELECT t.typname || ':' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS name
       FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid GROUP BY t.typname ORDER BY 1`,
    )
  ).map((row) => row.name);

interface Scope {
  organizationId: string;
  projectId: string;
  userId: string;
}

const entity = (scope: { organizationId: string }, snapshotId: string, kind: string) =>
  db.query(
    `INSERT INTO spec_entities (id, organization_id, snapshot_id, kind, spec_id, zone, path, data, content_hash, sort, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'technical', 'tech/x.yaml', '{}'::jsonb, $5, 1, now(), now())`,
    [scope.organizationId, snapshotId, kind, `X-${kind}`, "a".repeat(64)],
  );

/** Lancement terminé du mode donné : l'index unique partiel n'autorise qu'un lancement actif par livrable. */
async function launch(scope: Scope, mode: string): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO agent_launches (id, organization_id, project_id, deliverable, mode, status, requested_by, sources, updated_at)
     VALUES ($1, $2, $3, 'technical', $4, 'done', $5, '["architecture.current"]'::jsonb, now())`,
    [id, scope.organizationId, scope.projectId, mode, scope.userId],
  );
  return id;
}

const proposal = (scope: Scope, launchId: string, kind: string) =>
  db.query(
    `INSERT INTO agent_proposals (id, organization_id, project_id, launch_id, deliverable, kind, zone, position, title, rationale, payload, status, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'technical', $4, 'Stack', 0, 'Titre', 'Raison', '{}'::jsonb, 'pending', now())`,
    [scope.organizationId, scope.projectId, launchId, kind],
  );

const counter = (scope: Scope, name: string) =>
  db.query(
    `INSERT INTO project_counters (organization_id, project_id, name, last_value, created_at, updated_at)
     VALUES ($1, $2, $3::counter_name, 1, now(), now())`,
    [scope.organizationId, scope.projectId, name],
  );

const comment = (scope: { organizationId: string }, kind: string, targetRef: string) =>
  db.query(
    `INSERT INTO ticket_comments (id, organization_id, target_kind, target_id, target_ref, author_kind, author_id, body, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2::comment_target_kind, $3, $4, 'client', 'u', 'x', now(), now())`,
    [scope.organizationId, kind, randomUUID(), targetRef],
  );

const count = async (sql: string) => (await db.query(sql)).length;

describe("TK-115 migrations technique : up, down, up", () => {
  it("deploy : nouveaux genres, types, modes, compteur et cibles acceptés ; l'inconnu reste refusé", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const review = await reviewScope(db, "tech-up");
    const snapshot = await insertSnapshot(db, review, review.repoId);
    for (const kind of ["stack", "nfr", "environments", "endpoint"]) {
      expect(await sqlState(() => entity(review, snapshot, kind)), kind).toBeUndefined();
    }
    expect(await sqlState(() => entity(review, snapshot, "contrat"))).toBe("23514");
    const scope = await notificationScope(db, "tech-up");
    const id = await launch(scope, "compare");
    expect(await sqlState(() => launch(scope, "nfr"))).toBeUndefined();
    expect(await sqlState(() => launch(scope, "tout"))).toBe("23514");
    for (const kind of ["stack", "op", "nfr", "env", "doc_section"]) {
      expect(await sqlState(() => proposal(scope, id, kind)), kind).toBeUndefined();
    }
    expect(await sqlState(() => proposal(scope, id, "contract"))).toBe("23514");
    expect(await sqlState(() => counter(scope, "nfr"))).toBeUndefined();
    for (const [kind, ref] of [
      ["stack", "ST-sms"],
      ["environments", "environments"],
      ["tech_section", "DOC-objet"],
    ] as const) {
      expect(await sqlState(() => comment(review, kind, ref)), kind).toBeUndefined();
    }
    expect(await sqlState(() => comment(review, "layout", "x"))).toBe("22P02");
  }, 180_000);

  it("schema.prisma déclare le compteur et les cibles", () => {
    const schema = readFileSync(schemaPath, "utf8");
    expect(schema).toMatch(/enum CounterName \{[^}]*\bnfr\b[^}]*\}/);
    for (const value of ["stack", "environments", "tech_section"]) {
      expect(schema).toMatch(new RegExp(`enum CommentTargetKind \\{[^}]*\\b${value}\\b[^}]*\\}`));
    }
  });
});

describe("TK-115 migrations technique : retour arrière", () => {
  it("les down.sql, de la plus récente à la plus ancienne, ramènent à l'état précédent", async () => {
    for (const dir of dirs().filter((d) => d < named(SUFFIXES[0]))) {
      runPrismaOrThrow(
        ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
        baseline.url,
      );
    }
    const keep = await notificationScope(db, "tech-keep");
    const kept = await launch(keep, "all");
    await proposal(keep, kept, "feature");
    await counter(keep, "adr");
    const review = await reviewScope(db, "tech-keep-comment");
    await comment(review, "component", "C-api");
    const later = dirs().filter((d) => d >= named(SUFFIXES[0]));
    for (const dir of later.reverse()) {
      runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }
    expect(await constraints(db)).toEqual(await constraints(baseline));
    expect(await enums(db)).toEqual(await enums(baseline));
    for (const sql of [
      "SELECT 1 FROM spec_entities WHERE kind IN ('stack', 'nfr', 'environments')",
      "SELECT 1 FROM agent_proposals WHERE kind IN ('stack', 'op', 'nfr', 'env')",
      "SELECT 1 FROM agent_launches WHERE mode IN ('compare', 'nfr')",
      "SELECT 1 FROM project_counters WHERE name::text = 'nfr'",
      "SELECT 1 FROM ticket_comments WHERE target_kind::text IN ('stack', 'environments', 'tech_section')",
    ]) {
      expect(await count(sql), sql).toBe(0);
    }
    expect(await count("SELECT 1 FROM spec_entities WHERE kind = 'endpoint'")).toBe(1);
    expect(await count("SELECT 1 FROM agent_proposals WHERE kind = 'feature'")).toBe(1);
    expect(await count("SELECT 1 FROM project_counters WHERE name::text = 'adr'")).toBe(1);
    expect(await count("SELECT 1 FROM ticket_comments WHERE target_ref = 'C-api'")).toBe(1);
  }, 180_000);

  it("second deploy : migrate diff vide (code 0)", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 180_000);
});
