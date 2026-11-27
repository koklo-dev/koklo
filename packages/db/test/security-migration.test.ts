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
 * TK-117 lot A (cas 1) : les six migrations du livrable Sécurité (genres d'entité, types de proposition, modes de
 * lancement, compteur `threat`, cible de commentaire `security_summary`, contact d'incident). Additives ; `down.sql`
 * rejouables (up, down, up), `migrate diff` vide.
 */
const SUFFIXES = [
  "_security_entity_kinds",
  "_security_proposal_kinds",
  "_security_launch_modes",
  "_threat_counter",
  "_comment_security_summary_target",
  "_project_incident_contacts",
] as const;
const ENTITY_KINDS = ["threat", "sensitive", "rights", "asvs", "security_summary"];
const PROPOSAL_KINDS = ["threat", "sensitive", "right", "asvs", "summary"];
const MODES = ["threats", "classify", "asvs", "summary"];
const dirs = () => listMigrationDirs();
const named = (suffix: string) => dirs().find((dir) => dir.endsWith(suffix)) as string;
const code = (suffix: string, file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, named(suffix), file), "utf8").replace(/--.*$/gm, "");

describe("TK-117 migrations sécurité : dossiers et contenu", () => {
  it("six dossiers 20261127…, ordonnés après les commentaires d'opération, chacun avec un down.sql", () => {
    let previous = named("_comment_operation_targets");
    for (const suffix of SUFFIXES) {
      expect(named(suffix), `dossier *${suffix}`).toMatch(/^20261127\d{6}_/);
      expect(named(suffix) > previous, suffix).toBe(true);
      expect(code(suffix, "down.sql").trim().length).toBeGreaterThan(0);
      previous = named(suffix);
    }
  });

  it("additives : une seule table nouvelle, aucune ligne modifiée, rien de supprimé", () => {
    for (const suffix of SUFFIXES) {
      const up = code(suffix, "migration.sql");
      expect(up, suffix).not.toMatch(/CREATE\s+(?:FUNCTION|TRIGGER)/i);
      expect(up, suffix).not.toMatch(/^\s*(?:DELETE|UPDATE|INSERT)\b/im);
      expect(up, suffix).not.toMatch(/DROP\s+(?:TABLE|COLUMN|TYPE)/i);
      if (suffix !== "_project_incident_contacts") expect(up).not.toMatch(/CREATE\s+TABLE/i);
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

const entity = (
  scope: { organizationId: string },
  snapshotId: string,
  kind: string,
  specId = `X-${kind}`,
  sort = 1,
) =>
  db.query(
    `INSERT INTO spec_entities (id, organization_id, snapshot_id, kind, spec_id, zone, path, data, content_hash, sort, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'security', 'security/x.yaml', '{}'::jsonb, $5, $6, now(), now())`,
    [scope.organizationId, snapshotId, kind, specId, "a".repeat(64), sort],
  );

async function launch(scope: Scope, mode: string): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO agent_launches (id, organization_id, project_id, deliverable, mode, status, requested_by, sources, updated_at)
     VALUES ($1, $2, $3, 'security', $4, 'done', $5, '["security.current"]'::jsonb, now())`,
    [id, scope.organizationId, scope.projectId, mode, scope.userId],
  );
  return id;
}

const proposal = (scope: Scope, launchId: string, kind: string) =>
  db.query(
    `INSERT INTO agent_proposals (id, organization_id, project_id, launch_id, deliverable, kind, zone, position, title, rationale, payload, status, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'security', $4, 'Menaces', 0, 'Titre', 'Raison', '{}'::jsonb, 'pending', now())`,
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

const contact = (
  scope: Pick<Scope, "organizationId" | "projectId" | "userId">,
  name = "Marie",
  phone = "0600000000",
) =>
  db.query(
    `INSERT INTO project_incident_contacts (id, organization_id, project_id, name, phone, updated_by, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now())`,
    [scope.organizationId, scope.projectId, name, phone, scope.userId],
  );

const count = async (sql: string) => (await db.query(sql)).length;

describe("TK-117 migrations sécurité : valeurs acceptées", () => {
  it("genres, types, modes, compteur et cible acceptés ; l'inconnu reste refusé", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const review = await reviewScope(db, "sec-up");
    const snapshot = await insertSnapshot(db, review, review.repoId);
    for (const kind of ENTITY_KINDS) {
      expect(await sqlState(() => entity(review, snapshot, kind)), kind).toBeUndefined();
    }
    expect(await sqlState(() => entity(review, snapshot, "abuse"))).toBe("23514");
    const scope = await notificationScope(db, "sec-up");
    const [first = "", ...others] = MODES;
    const id = await launch(scope, first);
    for (const mode of others) expect(await sqlState(() => launch(scope, mode))).toBeUndefined();
    expect(await sqlState(() => launch(scope, "audit"))).toBe("23514");
    for (const kind of [...PROPOSAL_KINDS, "doc_section"]) {
      expect(await sqlState(() => proposal(scope, id, kind)), kind).toBeUndefined();
    }
    expect(await sqlState(() => proposal(scope, id, "rights"))).toBe("23514");
    expect(await sqlState(() => counter(scope, "threat"))).toBeUndefined();
    expect(await sqlState(() => comment(review, "security_summary", "summary"))).toBeUndefined();
    expect(await sqlState(() => comment(review, "threat", "SEC-T01"))).toBe("22P02");
  }, 180_000);

  it("schema.prisma déclare le compteur, la cible et le modèle", () => {
    const schema = readFileSync(schemaPath, "utf8");
    expect(schema).toMatch(/enum CounterName \{[^}]*\bthreat\b[^}]*\}/);
    expect(schema).toMatch(/enum CommentTargetKind \{[^}]*\bsecurity_summary\b[^}]*\}/);
    expect(schema).toMatch(/model ProjectIncidentContact \{/);
  });
});

describe("TK-117 migrations sécurité : bornes de l'index et contact d'incident", () => {
  it("index : un identifiant long de champ, une menace tardive, la recherche générée", async () => {
    const review = await reviewScope(db, "sec-bounds");
    const snapshot = await insertSnapshot(db, review, review.repoId);
    const field = `${"t".repeat(63)}.${"c".repeat(63)}`;
    expect(await sqlState(() => entity(review, snapshot, "sensitive", field, 200_000))).toBe(
      undefined,
    );
    expect(await sqlState(() => entity(review, snapshot, "sensitive", field))).toBe("23505");
    await entity(review, snapshot, "threat", "SEC-T100000", 2_147_483_647);
    const found = await db.query(
      "SELECT 1 FROM spec_entities WHERE snapshot_id = $1 AND search IS NOT NULL",
      [snapshot],
    );
    expect(found).toHaveLength(2);
  }, 60_000);

  it("contact d'incident : un par projet, bornes, clé composite et cascade", async () => {
    const scope = await notificationScope(db, "sec-contact");
    const other = await notificationScope(db, "sec-contact-other");
    expect(await sqlState(() => contact(scope, "a".repeat(120), "1".repeat(40)))).toBeUndefined();
    expect(await sqlState(() => contact(scope))).toBe("23505");
    expect(await sqlState(() => contact(other, "a".repeat(121)))).toBe("23514");
    expect(await sqlState(() => contact(other, "Marie", "1".repeat(41)))).toBe("23514");
    expect(await sqlState(() => contact(other, ""))).toBe("23514");
    expect(await sqlState(() => contact(other, "Marie", ""))).toBe("23514");
    const crossed = { ...other, organizationId: scope.organizationId };
    expect(await sqlState(() => contact(crossed))).toBe("23503");
    await db.query("DELETE FROM projects WHERE id = $1", [scope.projectId]);
    const left = await db.query("SELECT 1 FROM project_incident_contacts WHERE project_id = $1", [
      scope.projectId,
    ]);
    expect(left).toEqual([]);
  }, 60_000);
});

describe("TK-117 migrations sécurité : retour arrière", () => {
  it("les down.sql, de la plus récente à la plus ancienne, ramènent à l'état précédent", async () => {
    for (const dir of dirs().filter((d) => d < named(SUFFIXES[0]))) {
      runPrismaOrThrow(
        ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
        baseline.url,
      );
    }
    const keep = await notificationScope(db, "sec-keep");
    const kept = await launch(keep, "all");
    await proposal(keep, kept, "feature");
    await counter(keep, "nfr");
    const review = await reviewScope(db, "sec-keep-comment");
    await comment(review, "operation", "reservation.create");
    const later = dirs().filter((d) => d >= named(SUFFIXES[0]));
    for (const dir of later.reverse()) {
      runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }
    expect(await constraints(db)).toEqual(await constraints(baseline));
    expect(await enums(db)).toEqual(await enums(baseline));
    for (const sql of [
      `SELECT 1 FROM spec_entities WHERE kind IN ('${ENTITY_KINDS.join("','")}')`,
      `SELECT 1 FROM agent_proposals WHERE kind IN ('${PROPOSAL_KINDS.join("','")}')`,
      `SELECT 1 FROM agent_launches WHERE mode IN ('${MODES.join("','")}')`,
      "SELECT 1 FROM project_counters WHERE name::text = 'threat'",
      "SELECT 1 FROM ticket_comments WHERE target_kind::text = 'security_summary'",
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'project_incident_contacts'",
    ]) {
      expect(await count(sql), sql).toBe(0);
    }
    expect(await count("SELECT 1 FROM agent_proposals WHERE kind = 'feature'")).toBe(1);
    expect(await count("SELECT 1 FROM project_counters WHERE name::text = 'nfr'")).toBe(1);
    expect(await count("SELECT 1 FROM ticket_comments WHERE target_kind = 'operation'")).toBe(1);
  }, 180_000);

  it("second deploy : migrate diff vide (code 0)", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 180_000);
});
