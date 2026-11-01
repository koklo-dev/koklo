import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
import { LLM_TABLES } from "./support/llm-credentials-fixtures.ts";
import { OAUTH_TABLES } from "./support/oauth-fixtures.ts";
import { insertDelivery } from "./support/spec-fixtures.ts";
import { SUGGESTION_TABLES } from "./support/suggestions-fixtures.ts";
import { openPool } from "./support/ticket-fixtures.ts";

/**
 * TK-45a : migration additive `<horodatage>_webhook_installation_index` : un seul index B-tree
 * `webhook_deliveries_installation_external_id_idx` sur `webhook_deliveries(installation_external_id)`
 * (effacement RGPD des livraisons d'une installation supprimée). schema.prisma : `@@index([installationExternalId])`
 * sur `WebhookDelivery`. down.sql : `DROP INDEX` seul, retour exact à `_spec_batch_outcome`.
 */
const SUFFIX = "_webhook_installation_index";
const PREVIOUS = "_spec_batch_outcome";
const INDEX = "webhook_deliveries_installation_external_id_idx";

const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (dir: string, file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, dir, file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

async function inventory(db: TestDatabase) {
  const rows = async (sql: string) => (await db.query<{ name: string }>(sql)).map((r) => r.name);
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
    enums: await rows(
      `SELECT t.typname || ':' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS name
       FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' GROUP BY t.typname ORDER BY 1`,
    ),
    enumTypes: await rows(
      `SELECT t.typname AS name FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typtype = 'e' ORDER BY 1`,
    ),
    functions: await rows(
      `SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' ORDER BY 1`,
    ),
    triggers: await rows("SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1"),
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

/** Référence : les migrations antérieures à celle de TK-45a seules, appliquées à la main. */
async function applyEarlierMigrations(target: TestDatabase): Promise<TestDatabase> {
  for (const dir of dirs().filter((d) => d < migration())) {
    runPrismaOrThrow(
      ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
      target.url,
    );
  }
  return target;
}

/** Défait d'abord les migrations postérieures (TK-48a1), de la plus récente à la plus ancienne. */
async function rollBack(db: TestDatabase): Promise<void> {
  for (const later of dirs()
    .filter((d) => d > migration())
    .reverse()) {
    runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, later, "down.sql")], db.url);
    await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [later]);
  }
  runPrismaOrThrow(
    ["db", "execute", "--file", join(migrationsDir, migration(), "down.sql")],
    db.url,
  );
  await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [migration()]);
}

const deliveriesOf = (db: TestDatabase) =>
  db.query<{ delivery_id: string; installation_external_id: string | null }>(
    "SELECT delivery_id, installation_external_id FROM webhook_deliveries ORDER BY delivery_id",
  );

describe("TK-45a migration webhook_installation_index : dossier et contenu", () => {
  it("existe, suit la migration spec_batch_outcome et a un down.sql non vide", () => {
    const previous = dirs().find((dir) => dir.endsWith(PREVIOUS)) as string;

    expect(migration(), "dossier de migration *_webhook_installation_index").toBeDefined();
    expect(migration()).toMatch(/^\d{14}_webhook_installation_index$/);
    expect(migration() > previous).toBe(true);
    expect(sqlOf(migration(), "down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql est additive : aucun DROP, aucune table, un seul CREATE INDEX nommé", () => {
    const up = code(sqlOf(migration(), "migration.sql"));

    expect(up).not.toMatch(/\bDROP\b/i);
    expect(up).not.toMatch(/CREATE\s+TABLE|ALTER\s+TABLE|ALTER\s+TYPE/i);
    expect(up.match(/CREATE\s+(?:UNIQUE\s+)?INDEX/gi)).toHaveLength(1);
    expect(up).toContain(`"${INDEX}"`);
    expect(up).toMatch(/"webhook_deliveries"\s*\(\s*"installation_external_id"\s*\)/);
  });

  it("down.sql ne contient que DROP INDEX de cet index", () => {
    const down = code(sqlOf(migration(), "down.sql")).trim();

    expect(down).toMatch(
      new RegExp(`^DROP INDEX (?:IF EXISTS )?(?:"public"\\.)?"${INDEX}";?$`, "i"),
    );
  });

  it("cette migration n'ajoute aucune table (36 attendues au total avec TK-51b)", () => {
    expect(expectedTables).toHaveLength(36);
    expect(expectedTables).toContain("webhook_deliveries");
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

describe("TK-45a migration webhook_installation_index : up -> (données) -> down -> up", () => {
  it("deploy sur base vide : l'index B-tree simple existe sur installation_external_id", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);

    afterFirstUp = await inventory(db);
    const definition = afterFirstUp.indexes.find((line) => line.startsWith(`${INDEX} `));
    expect(definition, INDEX).toBeDefined();
    expect(definition).toContain(
      "ON public.webhook_deliveries USING btree (installation_external_id)",
    );
    expect(definition).not.toMatch(/WHERE|UNIQUE/);
  }, 180_000);

  it("l'index existant (reçu le, rattrapage, unicité) est conservé", () => {
    for (const name of [
      "webhook_deliveries_provider_delivery_id_key",
      "webhook_deliveries_received_at_idx",
      "webhook_deliveries_pending_idx",
    ]) {
      expect(
        afterFirstUp.indexes.some((line) => line.startsWith(`${name} `)),
        name,
      ).toBe(true);
    }
  });

  it("l'effacement par installation utilise l'index (plan d'exécution), sans effet sur les autres", async () => {
    const pool = openPool(db.url, 1);
    try {
      for (let i = 0; i < 300; i += 1) {
        await pool.query(
          `INSERT INTO webhook_deliveries (id, provider, delivery_id, event, installation_external_id,
             payload, status, attempts, received_at, created_at, updated_at)
           VALUES ($1, 'github', $2, 'push', $3, '{}'::jsonb, 'processed', 0, now(), now(), now())`,
          [randomUUID(), randomUUID(), String(i % 3)],
        );
      }
      await pool.query("ANALYZE webhook_deliveries");
      await pool.query("SET enable_seqscan = off");
      const plan = await pool.query(
        `EXPLAIN SELECT id FROM webhook_deliveries
         WHERE provider = 'github' AND installation_external_id = '1'`,
      );
      expect(plan.rows.map((r) => r["QUERY PLAN"]).join("\n")).toContain(INDEX);
      await pool.query("RESET enable_seqscan");
    } finally {
      await pool.end();
    }
  }, 180_000);
});

describe("TK-45a migration webhook_installation_index : retour arrière et schéma", () => {
  it("down.sql ramène exactement à l'état spec_batch_outcome, livraisons conservées", async () => {
    const expected = await inventory(await applyEarlierMigrations(baseline));
    await insertDelivery(db, { deliveryId: randomUUID() });
    await db.query(
      `UPDATE webhook_deliveries SET installation_external_id = '4242' WHERE delivery_id = (
         SELECT delivery_id FROM webhook_deliveries ORDER BY delivery_id LIMIT 1)`,
    );
    const before = await deliveriesOf(db);

    await rollBack(db);

    const actual = await inventory(db);
    expect(actual).toEqual(expected);
    expect(actual.indexes.some((line) => line.startsWith(`${INDEX} `))).toBe(false);
    const removed = afterFirstUp.indexes.filter((line) => !actual.indexes.includes(line));
    expect(
      removed.filter(
        (line) =>
          ![...OAUTH_TABLES, ...LLM_TABLES, ...SUGGESTION_TABLES].some((table) =>
            line.includes(table),
          ),
      ),
    ).toHaveLength(1);
    expect(await deliveriesOf(db)).toEqual(before);
  }, 180_000);

  it("second deploy : même inventaire qu'au premier up, livraisons conservées", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);

    expect(await inventory(db)).toEqual(afterFirstUp);
    expect(afterFirstUp.indexes.some((line) => line.startsWith(`${INDEX} `))).toBe(true);
    expect((await deliveriesOf(db)).length).toBeGreaterThanOrEqual(300);
  }, 180_000);

  it("migrate diff entre la base et schema.prisma est vide (code 0)", async () => {
    const indexes = await db.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE indexname = $1",
      [INDEX],
    );
    expect(indexes).toHaveLength(1);
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 120_000);

  it("schema.prisma déclare l'index sur WebhookDelivery", () => {
    const schema = readFileSync(schemaPath, "utf8");
    const model = schema.slice(schema.indexOf("model WebhookDelivery"));
    expect(model.slice(0, model.indexOf("\n}"))).toMatch(/@@index\(\[installationExternalId\]\)/);
  });
});
