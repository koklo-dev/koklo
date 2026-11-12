import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as dbPackage from "../src/index.ts";
import {
  expectedTables,
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
 * TK-99a (lot A) : migration `*_agent_proposals` : lancements d'agent, propositions et journal des décisions,
 * verrou en index unique partiel, CHECK de `notifications` étendus. `down.sql` rejouable (up, down, up),
 * `migrate diff` vide.
 */
const SUFFIX = "_agent_proposals";
const TABLES = ["agent_launches", "agent_proposals", "agent_proposal_decisions"] as const;

const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, migration(), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

describe("TK-99a migration agent_proposals : dossier et contenu", () => {
  it("existe, après 20261109120000_project_creations, avec un down.sql non vide", () => {
    expect(migration(), "dossier de migration *_agent_proposals").toBeDefined();
    const previous = dirs().find((dir) => dir.endsWith("_project_creations")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql : trois tables, index partiel du verrou, CHECK, sans enum ni fonction ni trigger", () => {
    const up = code(sqlOf("migration.sql"));
    expect(up.match(/CREATE\s+TABLE/gi)).toHaveLength(3);
    for (const table of TABLES) expect(up).toContain(`CREATE TABLE "${table}"`);
    expect(up).toMatch(
      /CREATE UNIQUE INDEX "agent_launches_one_active" ON "agent_launches"\("project_id", "deliverable"\) WHERE "status" IN \('queued', 'running'\)/,
    );
    expect(up.match(/CHECK\s*\(/gi)?.length).toBeGreaterThanOrEqual(12);
    expect(up).toContain("notifications_type_check");
    expect(up).toContain("proposal.ready");
    expect(up).toContain("agent_launch");
    expect(up).not.toMatch(/CREATE\s+TYPE|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|CREATE\s+TRIGGER/i);
  });

  it("down.sql retire les trois tables et restaure les CHECK de notifications", () => {
    const down = code(sqlOf("down.sql"));
    for (const table of TABLES) {
      expect(down).toMatch(new RegExp(`DROP TABLE (?:IF EXISTS )?(?:"public"\\.)?"${table}"`, "i"));
    }
    expect(down).toContain("notifications_type_check");
    expect(down).not.toMatch(/ADD CONSTRAINT "notifications_type_check"[^;]*proposal\.ready/);
    expect(down).not.toMatch(/DROP\s+(?:TYPE|FUNCTION|TRIGGER)/i);
  });

  it("expectedTables contient les trois tables (63 au total)", () => {
    for (const table of TABLES) expect(expectedTables).toContain(table);
    expect(expectedTables).toHaveLength(63);
  });

  it("les trois modèles sont des modèles d'organisation ; AgentProposal n'est plus en attente de seed", async () => {
    for (const model of ["AgentLaunch", "AgentProposal", "AgentProposalDecision"]) {
      expect(dbPackage.TENANT_MODELS, model).toContain(model);
    }
    const { PENDING_MODELS } = await import("../src/seed-volumes.ts");
    expect(PENDING_MODELS).not.toContain("AgentProposal");
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

async function inventory(target: TestDatabase) {
  const rows = async (sql: string) =>
    (await target.query<{ name: string }>(sql)).map((r) => r.name);
  return {
    tables: await rows(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' ORDER BY 1`,
    ),
    columns: await rows(
      `SELECT table_name || '.' || column_name || ' ' || udt_name || ' null=' || is_nullable
              || ' default=' || coalesce(column_default, '-') AS name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' ORDER BY 1`,
    ),
    indexes: await rows(
      `SELECT indexname || ' ' || indexdef AS name FROM pg_indexes
       WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY 1`,
    ),
    constraints: await rows(
      `SELECT cl.relname || '.' || con.conname || ' ' || pg_get_constraintdef(con.oid) AS name
       FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       WHERE n.nspname = 'public' AND cl.relname <> '_prisma_migrations' ORDER BY 1`,
    ),
  };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: cycle up, down, up d'une même migration, un test par étape
describe("TK-99a migration agent_proposals : up, down, up", () => {
  let afterFirstUp: Awaited<ReturnType<typeof inventory>>;

  it("deploy crée les tables, l'index de liste et l'index unique partiel du verrou", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    afterFirstUp = await inventory(db);
    expect(afterFirstUp.tables).toEqual([...expectedTables].sort());
    const indexes = afterFirstUp.indexes.filter((i) => i.includes(" ON public.agent_"));
    expect(
      indexes.some((i) =>
        /UNIQUE INDEX agent_launches_one_active.*\(project_id, deliverable\) WHERE .*status/.test(
          i,
        ),
      ),
      indexes.join("\n"),
    ).toBe(true);
    expect(
      indexes.some((i) =>
        /agent_proposals_list_idx.*\(project_id, deliverable, status, kind, zone, id\)/.test(i),
      ),
      indexes.join("\n"),
    ).toBe(true);
    const keys = afterFirstUp.constraints.filter((c) => c.startsWith("agent_proposals."));
    expect(
      keys.some((c) =>
        c.includes(
          "FOREIGN KEY (organization_id, launch_id) REFERENCES agent_launches(organization_id, id) ON DELETE CASCADE",
        ),
      ),
    ).toBe(true);
  }, 180_000);

  it("down.sql ramène exactement à l'état précédent (CHECK de notifications compris)", async () => {
    for (const dir of dirs().filter((d) => d < migration())) {
      runPrismaOrThrow(
        ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
        baseline.url,
      );
    }
    const expected = await inventory(baseline);
    const scope = await notificationScope(db, "agent-cycle");
    expect(scope.projectId).toBeDefined();

    for (const dir of dirs()
      .filter((d) => d >= migration())
      .reverse()) {
      runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }

    expect(await inventory(db)).toEqual(expected);
  }, 180_000);

  it("second deploy : même inventaire", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    expect(await inventory(db)).toEqual(afterFirstUp);
  }, 180_000);

  it("migrate diff entre la base et schema.prisma est vide (code 0)", () => {
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 120_000);

  it("notifications accepte proposal.ready / agent_launch et refuse toujours un type inconnu", async () => {
    const scope = await notificationScope(db, "agent-notif");
    const insert = (type: string, subjectKind: string) =>
      db.query(
        `INSERT INTO notifications (id, organization_id, recipient_user_id, type, project_id, subject_kind, subject_ref, dedupe_key, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'x', $6, now())`,
        [
          scope.organizationId,
          scope.userId,
          type,
          scope.projectId,
          subjectKind,
          `${type}-${subjectKind}`,
        ],
      );
    expect(await sqlState(() => insert("proposal.ready", "agent_launch"))).toBeUndefined();
    expect(await sqlState(() => insert("proposal.autre", "agent_launch"))).toBe("23514");
    expect(await sqlState(() => insert("proposal.ready", "autre"))).toBe("23514");
  });
});
