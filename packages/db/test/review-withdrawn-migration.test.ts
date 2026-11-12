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
import { insertReview, reviewScope } from "./support/reviews-fixtures.ts";
import { sqlState } from "./support/ticket-fixtures.ts";

/**
 * TK-104 (lot A) : migration `*_review_withdrawn` : `review_status` gagne `withdrawn` (« Annuler » une décision, B349) et
 * `notifications_type_check` accepte `review.reminded` (B352). `down.sql` rejouable (up, down, up), `migrate diff` vide.
 */
const SUFFIX = "_review_withdrawn";
const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, migration(), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

describe("TK-104 migration review_withdrawn : dossier et contenu", () => {
  it("existe, après 20261112150000_rule_counter, avec un down.sql non vide", () => {
    expect(migration(), "dossier de migration *_review_withdrawn").toBeDefined();
    const previous = dirs().find((dir) => dir.endsWith("_rule_counter")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql : ADD VALUE withdrawn et review.reminded, sans table ni fonction", () => {
    const up = code(sqlOf("migration.sql"));
    expect(up).toMatch(/ALTER TYPE "review_status" ADD VALUE 'withdrawn'/);
    expect(up).toContain("review.reminded");
    expect(up).not.toMatch(/CREATE\s+(?:TABLE|FUNCTION|TRIGGER)/i);
  });

  it("down.sql suspend le trigger du journal, recrée le type et retire review.reminded", () => {
    const down = code(sqlOf("down.sql"));
    expect(down).toMatch(/DISABLE TRIGGER "reviews_no_update_delete"/);
    expect(down).toMatch(/ENABLE TRIGGER "reviews_no_update_delete"/);
    expect(down).toMatch(
      /CREATE TYPE "public"\."review_status" AS ENUM \('approved', 'changes_requested'\)/,
    );
    expect(down).not.toMatch(/ADD CONSTRAINT "notifications_type_check"[^;]*review\.reminded/);
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
    enums: await rows(
      `SELECT t.typname || ':' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS name
       FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' GROUP BY t.typname ORDER BY 1`,
    ),
    columns: await rows(
      `SELECT table_name || '.' || column_name || ' ' || udt_name || ' null=' || is_nullable AS name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' ORDER BY 1`,
    ),
    constraints: await rows(
      `SELECT cl.relname || '.' || con.conname || ' ' || pg_get_constraintdef(con.oid) AS name
       FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       WHERE n.nspname = 'public' AND cl.relname <> '_prisma_migrations' ORDER BY 1`,
    ),
    triggers: await rows("SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1"),
  };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: cycle up, down, up d'une même migration, un test par étape
describe("TK-104 migration review_withdrawn : up, down, up", () => {
  let afterFirstUp: Awaited<ReturnType<typeof inventory>>;

  it("deploy ajoute withdrawn à review_status ; la base accepte une review withdrawn", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    afterFirstUp = await inventory(db);
    expect(afterFirstUp.enums).toContain("review_status:approved,changes_requested,withdrawn");
    const scope = await reviewScope(db, "withdrawn-up");
    const id = await insertReview(db, scope, { status: "withdrawn" });
    expect(id).toBeDefined();
  }, 180_000);

  it("down.sql ramène exactement à l'état précédent, journal compris, sans lignes withdrawn", async () => {
    for (const dir of dirs().filter((d) => d < migration())) {
      runPrismaOrThrow(
        ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
        baseline.url,
      );
    }
    const expected = await inventory(baseline);
    const scope = await reviewScope(db, "withdrawn-keep");
    const kept = await insertReview(db, scope, { status: "approved", targetRef: "F-002" });
    await insertReview(db, scope, { status: "withdrawn", targetRef: "F-002" });
    const notif = await notificationScope(db, "withdrawn-notif");
    await db.query(
      `INSERT INTO notifications (id, organization_id, recipient_user_id, type, project_id, subject_kind, subject_ref, dedupe_key, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'review.reminded', $3, 'review', 'x', 'review.reminded:1', now())`,
      [notif.organizationId, notif.userId, notif.projectId],
    );

    for (const dir of dirs()
      .filter((d) => d >= migration())
      .reverse()) {
      runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }

    expect(await inventory(db)).toEqual(expected);
    expect(await db.query("SELECT 1 FROM reviews WHERE id = $1", [kept])).toHaveLength(1);
    expect(await db.query("SELECT 1 FROM reviews WHERE status::text = 'withdrawn'")).toHaveLength(
      0,
    );
    expect(
      await db.query("SELECT 1 FROM notifications WHERE type = 'review.reminded'"),
    ).toHaveLength(0);
  }, 180_000);

  it("second deploy : même inventaire, journal toujours en ajout seul", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    expect(await inventory(db)).toEqual(afterFirstUp);
    const scope = await reviewScope(db, "withdrawn-append");
    const id = await insertReview(db, scope, { status: "withdrawn" });
    expect(
      await sqlState(() => db.query("UPDATE reviews SET comment = 'x' WHERE id = $1", [id])),
    ).toBe("23001");
  }, 180_000);

  it("migrate diff entre la base et schema.prisma est vide (code 0)", () => {
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 120_000);

  it("notifications accepte review.reminded et refuse toujours un type inconnu", async () => {
    const scope = await notificationScope(db, "withdrawn-notif2");
    const insert = (type: string) =>
      db.query(
        `INSERT INTO notifications (id, organization_id, recipient_user_id, type, project_id, subject_kind, subject_ref, dedupe_key, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'review', 'x', $5, now())`,
        [scope.organizationId, scope.userId, type, scope.projectId, `k-${type}`],
      );
    expect(await sqlState(() => insert("review.reminded"))).toBeUndefined();
    expect(await sqlState(() => insert("review.autre"))).toBe("23514");
  });
});
