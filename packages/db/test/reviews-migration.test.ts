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
  BASELINE_STATUSES,
  insertBaseline,
  insertReview,
  REVIEW_MIGRATION,
  REVIEW_STATUSES,
  REVIEW_SUFFIX,
  REVIEW_TABLES,
  REVIEW_TARGET_KINDS,
  reviewScope,
} from "./support/reviews-fixtures.ts";
import { insertSuggestion } from "./support/suggestions-fixtures.ts";
import { insertCounter } from "./support/ticket-fixtures.ts";

/**
 * TK-51c : migration `20261101110000_reviews_baselines` : deux tables (`reviews` d'abord, puis
 * `baselines` qui la référence par une FK à trois colonnes), trois enums (`review_target_kind`,
 * `review_status`, `baseline_status`), la fonction `reviews_immutable()` et deux triggers
 * (`reviews_no_update_delete`, `reviews_no_truncate`). Le `down.sql` retire `baselines`, puis
 * `reviews`, puis triggers, fonction et enums. Rejouable (up -> down -> up), `migrate diff` vide.
 */
const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(REVIEW_SUFFIX)) as string;
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

/** Référence : les migrations antérieures à celle de TK-51c seules, appliquées à la main. */
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
async function rollBackFromReviews(db: TestDatabase): Promise<void> {
  for (const dir of dirs()
    .filter((d) => d >= migration())
    .reverse()) {
    runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
    await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
  }
}

const countOf = async (db: TestDatabase, table: string) =>
  (await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`))[0]?.n;

describe("TK-51c migration reviews_baselines : dossier et contenu", () => {
  it("existe sous le nom 20261101110000_reviews_baselines, après suggestions", () => {
    expect(migration(), "dossier de migration *_reviews_baselines").toBeDefined();
    expect(migration()).toBe(REVIEW_MIGRATION);
    const previous = dirs().find((dir) => dir.endsWith("_suggestions")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf(migration(), "down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql crée reviews puis baselines, trois enums, une fonction et deux triggers, sans DROP", () => {
    const up = code(sqlOf(migration(), "migration.sql"));
    expect(up.match(/CREATE\s+TABLE/gi)).toHaveLength(2);
    expect(up.match(/CREATE\s+TYPE/gi)).toHaveLength(3);
    for (const type of ["review_target_kind", "review_status", "baseline_status"]) {
      expect(up).toContain(`"${type}"`);
    }
    expect(up.indexOf('CREATE TABLE "reviews"')).toBeGreaterThan(-1);
    expect(up.indexOf('CREATE TABLE "reviews"')).toBeLessThan(
      up.indexOf('CREATE TABLE "baselines"'),
    );
    expect(up.match(/CREATE\s+FUNCTION/gi)).toHaveLength(1);
    expect(up).toContain('"reviews_immutable"');
    expect(up.match(/CREATE\s+TRIGGER/gi)).toHaveLength(2);
    expect(up).toContain('"reviews_no_update_delete"');
    expect(up).toContain('"reviews_no_truncate"');
    expect(up).not.toMatch(/\bDROP\b/i);
    expect(up).not.toMatch(/ALTER\s+TYPE/i);
    expect(up).not.toMatch(/ALTER\s+TABLE\s+"(?!(?:reviews|baselines)")/i);
    expect(up).not.toMatch(/\b(?:INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+"[a-z_]+"\s+SET)/i);
  });

  it("down.sql retire baselines, puis reviews, puis triggers, fonction et enums", () => {
    const down = code(sqlOf(migration(), "down.sql"));
    const at = (pattern: RegExp) => down.search(pattern);
    expect(down).toMatch(/DROP TABLE (?:IF EXISTS )?(?:"public"\.)?"baselines"/i);
    expect(down).toMatch(/DROP TABLE (?:IF EXISTS )?(?:"public"\.)?"reviews"/i);
    expect(down).toMatch(/DROP TRIGGER (?:IF EXISTS )?"reviews_no_update_delete"/i);
    expect(down).toMatch(/DROP TRIGGER (?:IF EXISTS )?"reviews_no_truncate"/i);
    expect(down).toMatch(/DROP FUNCTION (?:IF EXISTS )?(?:"public"\.)?"reviews_immutable"/i);
    for (const type of ["review_target_kind", "review_status", "baseline_status"]) {
      expect(down).toMatch(new RegExp(`DROP TYPE (?:IF EXISTS )?(?:"public"\\.)?"${type}"`, "i"));
    }
    // baselines (qui référence reviews) disparaît avant reviews, les tables avant les enums.
    expect(at(/DROP TABLE (?:IF EXISTS )?(?:"public"\.)?"baselines"/i)).toBeLessThan(
      at(/DROP TABLE (?:IF EXISTS )?(?:"public"\.)?"reviews"/i),
    );
    expect(at(/DROP TABLE (?:IF EXISTS )?(?:"public"\.)?"reviews"/i)).toBeLessThan(
      at(/DROP TYPE/i),
    );
    expect(at(/DROP FUNCTION/i)).toBeLessThan(at(/DROP TYPE/i));
    expect(down).not.toMatch(/counter_name/i);
  });

  it("expectedTables contient les deux tables (39 au total avec TK-51d)", () => {
    for (const table of REVIEW_TABLES) expect(expectedTables).toContain(table);
    expect(expectedTables).toHaveLength(39);
  });
});

let db: TestDatabase;
let baseline: TestDatabase;
let afterFirstUp: Awaited<ReturnType<typeof inventory>>;
let scope: Awaited<ReturnType<typeof reviewScope>>;
let suggestionId: string;

beforeAll(async () => {
  db = await createTestDatabase();
  baseline = await createTestDatabase();
}, 180_000);

afterAll(async () => {
  await db?.dispose();
  await baseline?.dispose();
}, 60_000);

describe("TK-51c migration reviews_baselines : up -> (données) -> down -> up", () => {
  it("deploy sur base vide crée les tables, les enums, la fonction et les triggers", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    afterFirstUp = await inventory(db);
    expect(afterFirstUp.tables).toEqual([...expectedTables].sort());
    for (const table of REVIEW_TABLES) expect(afterFirstUp.tables).toContain(table);
    expect(afterFirstUp.enums).toContain(`review_target_kind:${REVIEW_TARGET_KINDS.join(",")}`);
    expect(afterFirstUp.enums).toContain(`review_status:${REVIEW_STATUSES.join(",")}`);
    expect(afterFirstUp.enums).toContain(`baseline_status:${BASELINE_STATUSES.join(",")}`);
    expect(afterFirstUp.functions).toContain("reviews_immutable");
    expect(afterFirstUp.triggers).toEqual(
      expect.arrayContaining(["reviews_no_update_delete", "reviews_no_truncate"]),
    );
  }, 180_000);

  it("down.sql ramène exactement à l'état précédent ; les données des autres tables survivent", async () => {
    const expected = await inventory(await applyEarlierMigrations(baseline));
    scope = await reviewScope(db, "cycle");
    await insertCounter(db, scope, "ticket", 3);
    await insertCounter(db, scope, "suggestion", 5);
    suggestionId = await insertSuggestion(db, scope, { key: "SG-5" });
    const reviewId = await insertReview(db, scope, {
      targetKind: "baseline",
      targetRef: "baseline-0",
    });
    await insertBaseline(db, scope, {
      status: "validated",
      reviewId,
      validatedAt: "2026-11-02T10:00:00Z",
    });

    await rollBackFromReviews(db);

    expect(await inventory(db)).toEqual(expected);
    const after = await inventory(db);
    for (const table of REVIEW_TABLES) expect(after.tables).not.toContain(table);
    expect(after.functions).not.toContain("reviews_immutable");
    expect(after.triggers).not.toContain("reviews_no_update_delete");
    // Données antérieures conservées : projet, repo, suggestion, compteurs (suggestion compris).
    expect(await db.query("SELECT 1 FROM projects WHERE id = $1", [scope.projectId])).toHaveLength(
      1,
    );
    expect(
      await db.query("SELECT 1 FROM project_repos WHERE id = $1", [scope.repoId]),
    ).toHaveLength(1);
    expect(await db.query("SELECT 1 FROM suggestions WHERE id = $1", [suggestionId])).toHaveLength(
      1,
    );
    const counters = await db.query<{ name: string; last_value: number }>(
      "SELECT name::text AS name, last_value FROM project_counters WHERE project_id = $1 ORDER BY 1",
      [scope.projectId],
    );
    expect(counters).toEqual([
      { name: "suggestion", last_value: 5 },
      { name: "ticket", last_value: 3 },
    ]);
  }, 180_000);
});

describe("TK-51c migration reviews_baselines : fonction d'immutabilité et repo sans FK", () => {
  it("le SQL fige search_path, qualifie les noms et ne référence jamais project_repos", () => {
    const up = sqlOf(migration(), "migration.sql");
    expect(up).toMatch(/SET search_path = public/i);
    expect(up).not.toMatch(/FROM "project_repos"/);
    expect(up).not.toMatch(/REFERENCES "project_repos"/);
  });
});

describe("TK-51c migration reviews_baselines : second up", () => {
  it("second deploy : même inventaire qu'au premier up, tables vides, trigger actif", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    expect(await inventory(db)).toEqual(afterFirstUp);
    expect(await countOf(db, "reviews")).toBe("0");
    expect(await countOf(db, "baselines")).toBe("0");
    const id = await insertReview(db, scope);
    await expect(
      db.query("UPDATE reviews SET comment = 'x' WHERE id = $1", [id]),
    ).rejects.toThrow();
  }, 180_000);
});

describe("TK-51c migration reviews_baselines : schéma Prisma", () => {
  it("migrate diff entre la base et schema.prisma est vide (code 0)", () => {
    expect(afterFirstUp?.tables, "les tables doivent exister avant de comparer").toContain(
      "reviews",
    );
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 120_000);

  it("la fonction installée porte search_path=public", async () => {
    const [fn] = await db.query<{ config: string[] | null }>(
      "SELECT proconfig AS config FROM pg_proc WHERE proname = 'reviews_immutable'",
    );
    expect(fn?.config).toContain("search_path=public");
  });

  it("schema.prisma déclare Review, Baseline et leurs trois enums mappés", () => {
    const schema = readFileSync(schemaPath, "utf8");
    expect(schema).toMatch(/model Review \{[\s\S]*?@@map\("reviews"\)/);
    expect(schema).toMatch(/model Baseline \{[\s\S]*?@@map\("baselines"\)/);
    expect(schema).toMatch(/enum ReviewTargetKind \{[\s\S]*?@@map\("review_target_kind"\)/);
    expect(schema).toMatch(/enum ReviewStatus \{[\s\S]*?@@map\("review_status"\)/);
    expect(schema).toMatch(/enum BaselineStatus \{[\s\S]*?@@map\("baseline_status"\)/);
  });
});
