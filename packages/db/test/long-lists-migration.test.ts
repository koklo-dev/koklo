import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  expectedTables,
  listMigrationDirs,
  migrationsDir,
  runPrisma,
  runPrismaOrThrow,
  schemaPath,
} from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { LONG_LISTS_INDEXES, LONG_LISTS_SUFFIX } from "./support/long-lists-fixtures.ts";
import {
  insertFeature,
  insertHead,
  insertInstallation,
  insertRepo,
  insertSnapshot,
} from "./support/spec-fixtures.ts";
import { insertScope, insertTicket, type Scope } from "./support/ticket-fixtures.ts";

/**
 * TK-94 : migration ADDITIVE `*_long_lists` (passation 07 §3 : index `(project_id, tri, id)` et
 * recherche plein texte). Colonnes générées `spec_number` et `search` sur `spec_features`, `search`
 * sur `tickets`, index de tri (dont deux partiels hors Prisma) et deux index GIN. Aucune table, aucune
 * donnée touchée ; `down.sql` réversible (up -> down -> up), `migrate diff` vide.
 */
const SUFFIX = LONG_LISTS_SUFFIX;
const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (dir: string, file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, dir, file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

async function inventory(db: TestDatabase) {
  const rows = async (sql: string) => (await db.query<{ name: string }>(sql)).map((r) => r.name);
  return {
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

describe("TK-94 migration long_lists : dossier et contenu", () => {
  it("existe, après 20261102100000_notification_email_state, avec un down.sql non vide", () => {
    expect(migration(), "dossier de migration *_long_lists").toBeDefined();
    const previous = dirs().find((dir) => dir.endsWith("_notification_email_state")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf(migration(), "down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql est additive : colonnes générées et index, rien d'autre", () => {
    const up = code(sqlOf(migration(), "migration.sql"));
    expect(up).toMatch(/ADD\s+COLUMN\s+"spec_number"\s+INTEGER\s+GENERATED\s+ALWAYS\s+AS/i);
    expect(up).toMatch(/to_tsvector\('french'/i);
    expect(up).toMatch(/USING\s+GIN\s*\(\s*"search"\s*\)/i);
    expect(up).not.toMatch(/\bDROP\b/i);
    expect(up).not.toMatch(/CREATE\s+TABLE/i);
    expect(up).not.toMatch(/\b(?:INSERT\s+INTO|DELETE\s+FROM|TRUNCATE)\b/i);
    expect(up).not.toMatch(/\bUPDATE\s+"[a-z_]+"\s+SET/i);
  });

  it("down.sql retire les index puis les colonnes, sans DROP TABLE", () => {
    const down = code(sqlOf(migration(), "down.sql"));
    expect(down).toMatch(/DROP\s+COLUMN\s+(?:IF EXISTS\s+)?"spec_number"/i);
    expect(down).toMatch(/DROP\s+COLUMN\s+(?:IF EXISTS\s+)?"search"/i);
    expect(down).not.toMatch(/DROP\s+TABLE/i);
    expect(down).not.toMatch(/\b(?:DELETE\s+FROM|TRUNCATE)\b/i);
  });

  it("n'ajoute aucune table : expectedTables est à 50 (TK-97)", () => {
    expect(expectedTables).toHaveLength(50);
  });
});

let db: TestDatabase;
let baseline: TestDatabase;
let afterFirstUp: Awaited<ReturnType<typeof inventory>>;

beforeAll(async () => {
  db = await createTestDatabase();
  baseline = await createTestDatabase();
}, 180_000);

afterAll(async () => {
  await db?.dispose();
  await baseline?.dispose();
}, 60_000);

const INDEXES = LONG_LISTS_INDEXES;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-94 migration long_lists : up -> (données) -> down -> up", () => {
  let scope: Scope;
  let snapshotId: string;

  it("deploy sur base vide ajoute les colonnes générées et les cinq index", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    afterFirstUp = await inventory(db);
    const names = (await db.query<{ indexname: string }>("SELECT indexname FROM pg_indexes")).map(
      (r) => r.indexname,
    );
    for (const index of INDEXES) expect(names, index).toContain(index);
    const generated = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE is_generated = 'ALWAYS' AND table_schema = 'public' ORDER BY 1, 2`,
    );
    expect(generated).toEqual([
      { table_name: "spec_features", column_name: "search" },
      { table_name: "spec_features", column_name: "spec_number" },
      { table_name: "tickets", column_name: "key_number" },
      { table_name: "tickets", column_name: "priority_rank" },
      { table_name: "tickets", column_name: "search" },
    ]);
  }, 180_000);

  it("spec_number suit le numéro de F-nnn (F-1000 se trie après F-999)", async () => {
    scope = await insertScope(db, "long-lists");
    const installation = await insertInstallation(db, scope);
    const repo = await insertRepo(db, scope, installation, { role: "spec" });
    snapshotId = await insertSnapshot(db, scope, repo);
    await insertHead(db, scope, repo, snapshotId);
    for (const specId of ["F-999", "F-9999999999", "F-1000", "F-002"]) {
      await insertFeature(db, scope, snapshotId, specId);
    }
    const rows = await db.query<{ spec_id: string; spec_number: number }>(
      "SELECT spec_id, spec_number FROM spec_features WHERE snapshot_id = $1 ORDER BY spec_number, id",
      [snapshotId],
    );
    // Au-delà de 9 chiffres, l'identifiant ne tient pas dans INTEGER : il est rangé en dernier.
    expect(rows.map((r) => [r.spec_id, r.spec_number])).toEqual([
      ["F-002", 2],
      ["F-999", 999],
      ["F-1000", 1000],
      ["F-9999999999", 2_147_483_647],
    ]);
  });

  it("priority_rank (critical 0 à low 3) et key_number (numéro de la clé) suivent la ligne", async () => {
    for (const [key, priority] of [
      ["TK-9", "low"],
      ["TK-10", "critical"],
      ["TK-11", "medium"],
      ["TK-12", "high"],
    ] as const) {
      await insertTicket(db, scope, { key });
      await db.query("UPDATE tickets SET priority = $2::ticket_priority WHERE key = $1", [
        key,
        priority,
      ]);
    }
    const rows = await db.query<{ key: string; priority_rank: number; key_number: number }>(
      `SELECT key, priority_rank, key_number FROM tickets WHERE project_id = $1 AND key = ANY($2)
        ORDER BY priority_rank, key_number, id`,
      [scope.projectId, ["TK-9", "TK-10", "TK-11", "TK-12"]],
    );
    expect(rows.map((r) => [r.key, r.priority_rank, r.key_number])).toEqual([
      ["TK-10", 0, 10],
      ["TK-12", 1, 12],
      ["TK-11", 2, 11],
      ["TK-9", 3, 9],
    ]);
    await db.query("UPDATE tickets SET priority = 'high' WHERE key = 'TK-9'");
    const [moved] = await db.query<{ priority_rank: number }>(
      "SELECT priority_rank FROM tickets WHERE key = 'TK-9' AND project_id = $1",
      [scope.projectId],
    );
    expect(moved?.priority_rank, "la colonne suit la mise à jour de la ligne").toBe(1);
  });

  it("search des tickets couvre clé, titre et description (français, préfixe)", async () => {
    await insertTicket(db, scope, { key: "TK-77" });
    await db.query(
      "UPDATE tickets SET title = 'Annulation groupée', description = 'Réservations à annuler' WHERE key = 'TK-77'",
    );
    const hit = async (query: string) =>
      (
        await db.query<{ key: string }>(
          "SELECT key FROM tickets WHERE project_id = $1 AND search @@ to_tsquery('french', $2)",
          [scope.projectId, query],
        )
      ).map((r) => r.key);
    expect(await hit("annul:*")).toEqual(["TK-77"]);
    expect(await hit("reservation:*")).toEqual([]);
    expect(await hit("réservation:*")).toEqual(["TK-77"]);
    expect(await hit("TK:* & 77:*")).toEqual(["TK-77"]);
  });

  it("down.sql ramène exactement à l'état précédent ; les lignes survivent", async () => {
    const earlier = dirs().filter((d) => d < migration());
    for (const dir of earlier) {
      runPrismaOrThrow(
        ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
        baseline.url,
      );
    }
    const expected = await inventory(baseline);
    // Les migrations postérieures (TK-95) sont défaites d'abord, de la plus récente à la plus ancienne.
    const downs = dirs()
      .filter((d) => d >= migration())
      .reverse();
    for (const dir of downs) {
      runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }
    expect(await inventory(db)).toEqual(expected);
    const rows = await db.query("SELECT 1 FROM spec_features WHERE snapshot_id = $1", [snapshotId]);
    expect(rows, "les fonctionnalités existantes sont conservées").toHaveLength(4);
  }, 180_000);

  it("second deploy : même inventaire qu'au premier up, colonnes recalculées", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    expect(await inventory(db)).toEqual(afterFirstUp);
    const [row] = await db.query<{ spec_number: number }>(
      "SELECT spec_number FROM spec_features WHERE snapshot_id = $1 AND spec_id = 'F-1000'",
      [snapshotId],
    );
    expect(row?.spec_number).toBe(1000);
  }, 180_000);

  it("migrate diff entre la base et schema.prisma est vide (code 0)", () => {
    const { status, output } = runPrisma(
      ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath, "--exit-code"],
      db.url,
    );
    expect(status, output).toBe(0);
  }, 120_000);
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-94 migration long_lists : les index sont utilisés (1 000 fonctionnalités, 5 000 tickets)", () => {
  let scope: Scope;
  let snapshotId: string;

  /**
   * Plan d'exécution sur UNE connexion (`SET` ne survit pas à `db.query`, qui ouvre un client par
   * requête). `indexOnly` interdit le parcours séquentiel : sur 1 000 lignes il reste moins cher que
   * le GIN, la question posée est alors « l'index peut-il servir cette requête ? ».
   */
  const plan = async (sql: string, params: unknown[], indexOnly = false) => {
    const client = new pg.Client({ connectionString: db.url });
    await client.connect();
    try {
      if (indexOnly) await client.query("SET enable_seqscan = off");
      const result = await client.query(`EXPLAIN ${sql}`, params);
      return result.rows.map((row) => row["QUERY PLAN"]).join("\n");
    } finally {
      await client.end();
    }
  };

  beforeAll(async () => {
    scope = await insertScope(db, "long-lists-plan");
    const installation = await insertInstallation(db, scope);
    const repo = await insertRepo(db, scope, installation, { role: "spec" });
    snapshotId = await insertSnapshot(db, scope, repo);
    await db.query(
      `INSERT INTO spec_features (id, organization_id, snapshot_id, spec_id, title, status, priority,
         file_path, created_at, updated_at)
       SELECT gen_random_uuid(), $1, $2, 'F-' || lpad(n::text, 4, '0'),
              CASE WHEN n = 7 THEN 'Annulation groupée' ELSE 'Fonctionnalité ' || n END,
              'brouillon', 'should', 'features/F-' || n || '.md', now(), now()
       FROM generate_series(1, 1000) AS n`,
      [scope.organizationId, snapshotId],
    );
    await db.query(
      `INSERT INTO tickets (id, organization_id, project_id, key, title, description, type, status,
         priority, pkg, sensitivity, attempts, review_rounds, created_at, updated_at)
       SELECT gen_random_uuid(), $1, $2, 'TK-' || n, CASE WHEN n = 7 THEN 'Annulation groupée' ELSE 'Ticket ' || n END, '', 'task',
              (ARRAY['backlog','todo','in_progress','done','blocked'])[1 + n % 5]::ticket_status, 'medium',
              'api', 'safe', 0, 0, now() + (n || ' seconds')::interval, now()
       FROM generate_series(1, 5000) AS n`,
      [scope.organizationId, scope.projectId],
    );
    await db.query("ANALYZE");
  }, 120_000);

  it("fonctionnalités : tri (snapshot_id, spec_number, id)", async () => {
    const text = await plan(
      "SELECT id FROM spec_features WHERE snapshot_id = $1 ORDER BY spec_number, id LIMIT 51",
      [snapshotId],
    );
    expect(text).toContain("spec_features_snapshot_id_spec_number_id_idx");
  });

  it("fonctionnalités : recherche sélective par l'index GIN", async () => {
    const text = await plan(
      "SELECT id FROM spec_features WHERE snapshot_id = $1 AND search @@ to_tsquery('french', 'annul:*')",
      [snapshotId],
      true,
    );
    expect(text).toContain("spec_features_search_idx");
  });

  it("tickets : tri (project_id, priority_rank, key_number, id) et colonne de kanban avec status", async () => {
    const all = await plan(
      "SELECT id FROM tickets WHERE project_id = $1 AND deleted_at IS NULL ORDER BY priority_rank, key_number, id LIMIT 51",
      [scope.projectId],
    );
    expect(all).toContain("tickets_project_id_priority_rank_key_number_id_idx");
    const column = await plan(
      "SELECT id FROM tickets WHERE project_id = $1 AND deleted_at IS NULL AND status = 'todo' ORDER BY priority_rank, key_number, id LIMIT 31",
      [scope.projectId],
    );
    expect(column).toContain("tickets_project_id_status_priority_rank_key_number_id_idx");
  });

  it("tickets : recherche sélective par l'index GIN", async () => {
    const text = await plan(
      "SELECT id FROM tickets WHERE project_id = $1 AND search @@ to_tsquery('french', 'annul:*')",
      [scope.projectId],
      true,
    );
    expect(text).toContain("tickets_search_idx");
  });
});
