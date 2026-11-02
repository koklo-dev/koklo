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
  NOTIFICATION_EMAIL_STATE_SUFFIX,
  NOTIFICATION_EMAIL_STATES,
  NOTIFICATION_SUFFIX,
  type NotificationScope,
  notificationScope,
} from "./support/notifications-fixtures.ts";

/**
 * TK-58a : migration ADDITIVE `*_notification_email_state` : deux colonnes (`email_state`,
 * `emailed_at`), deux CHECK et un index partiel sur `notifications`. Aucune table créée, aucune
 * donnée supprimée ; le `down.sql` est réversible (up -> down -> up), `migrate diff` vide.
 */
const dirs = () => listMigrationDirs();
const migration = () =>
  dirs().find((dir) => dir.endsWith(NOTIFICATION_EMAIL_STATE_SUFFIX)) as string;
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
    functions: await rows(
      `SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' ORDER BY 1`,
    ),
    triggers: await rows("SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1"),
  };
}

/** Référence : toutes les migrations antérieures à celle-ci, appliquées à la main. */
async function applyEarlierMigrations(target: TestDatabase): Promise<TestDatabase> {
  for (const dir of dirs().filter((d) => d < migration())) {
    runPrismaOrThrow(
      ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
      target.url,
    );
  }
  return target;
}

async function rollBackEmailState(db: TestDatabase): Promise<void> {
  const dir = migration();
  runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
  await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
}

/** Évite qu'un refus d'écriture soit pris pour une contrainte alors que la colonne n'existe pas. */
async function expectEmailColumns(): Promise<void> {
  const rows = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'notifications' AND column_name IN ('email_state', 'emailed_at')`,
  );
  expect(rows.map((r) => r.column_name).sort()).toEqual(["email_state", "emailed_at"]);
}

describe("TK-58a migration notification_email_state : dossier et contenu", () => {
  it("existe, après 20261101120000_notifications, avec un down.sql non vide", () => {
    expect(migration(), "dossier de migration *_notification_email_state").toBeDefined();
    const previous = dirs().find((dir) => dir.endsWith(NOTIFICATION_SUFFIX)) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf(migration(), "down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql est additive : colonnes + CHECK + index partiel sur notifications seulement", () => {
    const up = code(sqlOf(migration(), "migration.sql"));
    expect(up).toMatch(/ALTER\s+TABLE\s+"notifications"/i);
    expect(up).toMatch(/ADD\s+COLUMN\s+"email_state"\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'pending'/i);
    expect(up).toMatch(/ADD\s+COLUMN\s+"emailed_at"\s+TIMESTAMPTZ\(3\)/i);
    expect(up).toMatch(/CREATE\s+INDEX\s+"notifications_email_pending_idx"/i);
    expect(up).not.toMatch(/\bDROP\b/i);
    expect(up).not.toMatch(/CREATE\s+TABLE/i);
    expect(up).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|TRIGGER|TYPE)/i);
    expect(up).not.toMatch(/ALTER\s+TABLE\s+"(?!notifications")/i);
    expect(up).not.toMatch(/\b(?:INSERT\s+INTO|DELETE\s+FROM|TRUNCATE)\b/i);
    expect(up).not.toMatch(/\bUPDATE\s+"[a-z_]+"\s+SET/i);
  });

  it("down.sql retire l'index, les CHECK et les deux colonnes, sans DROP TABLE", () => {
    const down = code(sqlOf(migration(), "down.sql"));
    expect(down).toMatch(
      /DROP\s+INDEX\s+(?:IF EXISTS\s+)?(?:"public"\.)?"notifications_email_pending_idx"/i,
    );
    expect(down).toMatch(/DROP\s+COLUMN\s+(?:IF EXISTS\s+)?"emailed_at"/i);
    expect(down).toMatch(/DROP\s+COLUMN\s+(?:IF EXISTS\s+)?"email_state"/i);
    expect(down).not.toMatch(/DROP\s+TABLE/i);
    expect(down).not.toMatch(/DROP\s+(?:TYPE|FUNCTION|TRIGGER)/i);
    expect(down).not.toMatch(/\b(?:DELETE\s+FROM|TRUNCATE)\b/i);
  });

  it("n'ajoute aucune table : expectedTables reste à 39", () => {
    expect(expectedTables).toHaveLength(39);
    expect(expectedTables).toContain("notifications");
  });
});

let db: TestDatabase;
let baseline: TestDatabase;
let afterFirstUp: Awaited<ReturnType<typeof inventory>>;
let survivor: { scope: NotificationScope; id: string };

beforeAll(async () => {
  db = await createTestDatabase();
  baseline = await createTestDatabase();
}, 180_000);

afterAll(async () => {
  await db?.dispose();
  await baseline?.dispose();
}, 60_000);

describe("TK-58a migration notification_email_state : up -> (données) -> down -> up", () => {
  it("deploy sur base vide ajoute les deux colonnes et l'index partiel", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    afterFirstUp = await inventory(db);
    expect(afterFirstUp.tables).toEqual([...expectedTables].sort());
    expect(afterFirstUp.columns).toContain(
      "notifications.email_state text null=NO default='pending'::text",
    );
    expect(afterFirstUp.columns).toContain(
      "notifications.emailed_at timestamptz null=YES default=-",
    );
  }, 180_000);

  it("une ligne insérée sans les nouvelles colonnes est 'pending' et sans emailed_at", async () => {
    const scope = await notificationScope(db, "email-default");
    const id = await insertNotification(db, scope);
    const [row] = await db.query<{ email_state: string; emailed_at: Date | null }>(
      "SELECT email_state, emailed_at FROM notifications WHERE id = $1",
      [id],
    );
    expect(row).toEqual({ email_state: "pending", emailed_at: null });
    survivor = { scope, id };
  });

  it("down.sql ramène exactement à l'état précédent ; les notifications survivent", async () => {
    const expected = await inventory(await applyEarlierMigrations(baseline));
    await db.query(
      "UPDATE notifications SET email_state = 'sent', emailed_at = now() WHERE id = $1",
      [survivor.id],
    );
    await rollBackEmailState(db);
    expect(await inventory(db)).toEqual(expected);
    const rows = await db.query("SELECT 1 FROM notifications WHERE id = $1", [survivor.id]);
    expect(rows, "la notification existante est conservée (non destructif)").toHaveLength(1);
  }, 180_000);

  it("second deploy : même inventaire qu'au premier up, ligne conservée en 'pending'", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    expect(await inventory(db)).toEqual(afterFirstUp);
    const [row] = await db.query<{ email_state: string }>(
      "SELECT email_state FROM notifications WHERE id = $1",
      [survivor.id],
    );
    expect(row?.email_state).toBe("pending");
  }, 180_000);
});

describe("TK-58a migration notification_email_state : contraintes et index", () => {
  const stateOf = (id: string) =>
    db.query<{ email_state: string }>("SELECT email_state FROM notifications WHERE id = $1", [id]);

  it.each(NOTIFICATION_EMAIL_STATES)(
    "l'état %s est accepté avec la bonne emailed_at",
    async (state) => {
      const scope = await notificationScope(db, `email-${state}`);
      const id = await insertNotification(db, scope);
      const at = state === "sent" ? "now()" : "NULL";
      await db.query(
        `UPDATE notifications SET email_state = $2, emailed_at = ${at} WHERE id = $1`,
        [id, state],
      );
      expect((await stateOf(id))[0]?.email_state).toBe(state);
    },
  );

  it("un état hors liste fermée est refusé", async () => {
    await expectEmailColumns();
    const scope = await notificationScope(db, "email-bad");
    const id = await insertNotification(db, scope);
    await expect(
      db.query("UPDATE notifications SET email_state = 'queued' WHERE id = $1", [id]),
    ).rejects.toThrow();
    await expect(
      db.query("UPDATE notifications SET email_state = NULL WHERE id = $1", [id]),
    ).rejects.toThrow();
  });

  it("emailed_at est posé si et seulement si l'état est 'sent'", async () => {
    await expectEmailColumns();
    const scope = await notificationScope(db, "email-pair");
    const id = await insertNotification(db, scope);
    await expect(
      db.query("UPDATE notifications SET email_state = 'sent', emailed_at = NULL WHERE id = $1", [
        id,
      ]),
    ).rejects.toThrow();
    for (const state of ["pending", "skipped", "failed"]) {
      await expect(
        db.query("UPDATE notifications SET email_state = $2, emailed_at = now() WHERE id = $1", [
          id,
          state,
        ]),
      ).rejects.toThrow();
    }
  });
});

describe("TK-58a migration notification_email_state : index et schéma Prisma", () => {
  it("l'index partiel porte sur created_at et ne couvre que les lignes 'pending'", async () => {
    const [row] = await db.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'notifications_email_pending_idx'",
    );
    expect(row?.indexdef).toMatch(/\(created_at\)/);
    expect(row?.indexdef).toMatch(/WHERE \(?\(?email_state = 'pending'/);
  });

  it("migrate diff entre la base et schema.prisma est vide (code 0)", async () => {
    await expectEmailColumns();
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 120_000);

  it("schema.prisma déclare emailState et emailedAt sur Notification, sans nouvel enum", () => {
    const schema = readFileSync(schemaPath, "utf8");
    const model = schema.match(/model Notification \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(model).toMatch(/emailState\s+String\s+@default\("pending"\)\s+@map\("email_state"\)/);
    expect(model).toMatch(/emailedAt\s+DateTime\?\s+@map\("emailed_at"\)\s+@db\.Timestamptz\(3\)/);
    expect(schema).not.toMatch(/enum\s+\w*Email/i);
  });
});
