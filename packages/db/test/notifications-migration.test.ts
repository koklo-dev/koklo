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
import {
  insertNotification,
  NOTIFICATION_MIGRATION,
  NOTIFICATION_SUFFIX,
  NOTIFICATION_TABLES,
  notificationScope,
} from "./support/notifications-fixtures.ts";
import { insertBaseline, insertReview, reviewScope } from "./support/reviews-fixtures.ts";
import { insertCounter } from "./support/ticket-fixtures.ts";

/**
 * TK-51d : migration `20261101120000_notifications` : une seule table (`notifications`), aucun
 * enum, aucune fonction, aucun trigger. Le `down.sql` la retire seule. Rejouable
 * (up -> down -> up), `migrate diff` vide, données des tables antérieures conservées.
 */
const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(NOTIFICATION_SUFFIX)) as string;
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

/** Référence : les migrations antérieures à celle de TK-51d seules, appliquées à la main. */
async function applyEarlierMigrations(target: TestDatabase): Promise<TestDatabase> {
  for (const dir of dirs().filter((d) => d < migration())) {
    runPrismaOrThrow(
      ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
      target.url,
    );
  }
  return target;
}

/** Défait cette migration et toutes les postérieures, de la plus récente à la plus ancienne. */
async function rollBackFromNotifications(db: TestDatabase): Promise<void> {
  for (const dir of dirs()
    .filter((d) => d >= migration())
    .reverse()) {
    runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
    await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
  }
}

const countOf = async (db: TestDatabase, table: string) =>
  (await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`))[0]?.n;

describe("TK-51d migration notifications : dossier et contenu", () => {
  it("existe sous le nom 20261101120000_notifications, après reviews_baselines", () => {
    expect(migration(), "dossier de migration *_notifications").toBeDefined();
    expect(migration()).toBe(NOTIFICATION_MIGRATION);
    const previous = dirs().find((dir) => dir.endsWith("_reviews_baselines")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf(migration(), "down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql crée une table, sans enum, fonction ni trigger, sans DROP ni donnée", () => {
    const up = code(sqlOf(migration(), "migration.sql"));
    expect(up.match(/CREATE\s+TABLE/gi)).toHaveLength(1);
    expect(up).toContain('CREATE TABLE "notifications"');
    expect(up).not.toMatch(/CREATE\s+TYPE/i);
    expect(up).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i);
    expect(up).not.toMatch(/CREATE\s+TRIGGER/i);
    expect(up).not.toMatch(/\bDROP\b/i);
    expect(up).not.toMatch(/ALTER\s+TYPE/i);
    expect(up).not.toMatch(/ALTER\s+TABLE\s+"(?!notifications")/i);
    expect(up).not.toMatch(/\b(?:INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+"[a-z_]+"\s+SET)/i);
    expect(up).not.toMatch(/\bjsonb?\b/i);
  });

  it("down.sql retire seulement la table notifications", () => {
    const down = code(sqlOf(migration(), "down.sql"));
    expect(down.match(/DROP\s+TABLE/gi)).toHaveLength(1);
    expect(down).toMatch(/DROP TABLE (?:IF EXISTS )?(?:"public"\.)?"notifications"/i);
    expect(down).not.toMatch(/DROP\s+(?:TYPE|FUNCTION|TRIGGER)/i);
    expect(down).not.toMatch(/counter_name/i);
  });

  it("expectedTables contient la table (39 au total)", () => {
    for (const table of NOTIFICATION_TABLES) expect(expectedTables).toContain(table);
    expect(expectedTables).toHaveLength(39);
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

describe("TK-51d migration notifications : up -> (données) -> down -> up", () => {
  it("deploy sur base vide crée la table, sans nouvel enum ni fonction ni trigger", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    afterFirstUp = await inventory(db);
    expect(afterFirstUp.tables).toEqual([...expectedTables].sort());
    for (const table of NOTIFICATION_TABLES) expect(afterFirstUp.tables).toContain(table);
    const earlier = await inventory(await applyEarlierMigrations(baseline));
    expect(afterFirstUp.enums).toEqual(earlier.enums);
    expect(afterFirstUp.functions).toEqual(earlier.functions);
    expect(afterFirstUp.triggers).toEqual(earlier.triggers);
  }, 180_000);

  it("down.sql ramène exactement à l'état précédent ; les données des autres tables survivent", async () => {
    const expected = await inventory(baseline);
    const scope = await reviewScope(db, "cycle");
    await insertCounter(db, scope, "suggestion", 5);
    const reviewId = await insertReview(db, scope, {
      targetKind: "baseline",
      targetRef: "baseline-0",
    });
    await insertBaseline(db, scope, {
      status: "validated",
      reviewId,
      validatedAt: "2026-11-02T10:00:00Z",
    });
    const notified = await notificationScope(db, "cycle-notif");
    await insertNotification(db, notified);

    await rollBackFromNotifications(db);

    expect(await inventory(db)).toEqual(expected);
    const after = await inventory(db);
    for (const table of NOTIFICATION_TABLES) expect(after.tables).not.toContain(table);
    // Données antérieures conservées : projets, membre, review, baseline, compteur.
    expect(await db.query("SELECT 1 FROM projects WHERE id = $1", [scope.projectId])).toHaveLength(
      1,
    );
    expect(await db.query("SELECT 1 FROM reviews WHERE id = $1", [reviewId])).toHaveLength(1);
    expect(await countOf(db, "baselines")).toBe("1");
    expect(
      await db.query("SELECT 1 FROM members WHERE user_id = $1", [notified.userId]),
    ).toHaveLength(1);
    expect(
      await db.query("SELECT 1 FROM project_counters WHERE project_id = $1", [scope.projectId]),
    ).toHaveLength(1);
  }, 180_000);
});

describe("TK-51d migration notifications : second up", () => {
  it("second deploy : même inventaire qu'au premier up, table vide et utilisable", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    expect(await inventory(db)).toEqual(afterFirstUp);
    expect(await countOf(db, "notifications")).toBe("0");
    const scope = await notificationScope(db, "second-up");
    await insertNotification(db, scope);
    expect(await countOf(db, "notifications")).toBe("1");
  }, 180_000);
});

describe("TK-51d migration notifications : schéma Prisma", () => {
  it("migrate diff entre la base et schema.prisma est vide (code 0)", () => {
    expect(afterFirstUp?.tables, "les tables doivent exister avant de comparer").toContain(
      "notifications",
    );
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 120_000);

  it("schema.prisma déclare Notification, sans champ Json ni nouvel enum", () => {
    const schema = readFileSync(schemaPath, "utf8");
    const model = schema.match(/model Notification \{([\s\S]*?)\n\}/);
    expect(model?.[0]).toMatch(/@@map\("notifications"\)/);
    expect(model?.[1]).not.toMatch(/\bJson\b/);
    expect(schema).not.toMatch(/enum Notification/);
  });
});
