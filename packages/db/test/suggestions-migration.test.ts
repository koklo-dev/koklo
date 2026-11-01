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
  COUNTER_NAMES_AFTER,
  COUNTER_NAMES_BEFORE,
  insertSuggestion,
  SUGGESTION_MIGRATION,
  SUGGESTION_STATUSES,
  SUGGESTION_SUFFIX,
  SUGGESTION_TABLE,
  SUGGESTION_TARGET_KINDS,
  suggestionScope,
} from "./support/suggestions-fixtures.ts";
import { insertCounter } from "./support/ticket-fixtures.ts";

/**
 * TK-51b : migration `20261101100000_suggestions` : une table `suggestions`, deux enums
 * (`suggestion_status`, `suggestion_target_kind`) et la valeur `suggestion` ajoutée à `counter_name`.
 * Le `down.sql` retire la table et les enums et RECRÉE `counter_name` (PostgreSQL ne retire pas une
 * valeur d'enum), comme `20261030150000_spec_batch_outcome/down.sql`, sans toucher aux compteurs
 * ticket, sprint et feature. Rejouable (up -> down -> up), `migrate diff` vide.
 */
const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(SUGGESTION_SUFFIX)) as string;
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

/** Référence : les migrations antérieures à celle de TK-51b seules, appliquées à la main. */
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
async function rollBackFromSuggestions(db: TestDatabase): Promise<void> {
  for (const dir of dirs()
    .filter((d) => d >= migration())
    .reverse()) {
    runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
    await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
  }
}

const counters = (db: TestDatabase, projectId: string) =>
  db.query<{ name: string; last_value: number }>(
    "SELECT name::text AS name, last_value FROM project_counters WHERE project_id = $1 ORDER BY name::text",
    [projectId],
  );

describe("TK-51b migration suggestions : dossier et contenu", () => {
  it("existe sous le nom 20261101100000_suggestions, après llm_provider_credentials", () => {
    expect(migration(), "dossier de migration *_suggestions").toBeDefined();
    expect(migration()).toBe(SUGGESTION_MIGRATION);
    const previous = dirs().find((dir) => dir.endsWith("_llm_provider_credentials")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf(migration(), "down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql crée une table, deux enums et ajoute la valeur suggestion, sans DROP", () => {
    const up = code(sqlOf(migration(), "migration.sql"));
    expect(up.match(/CREATE\s+TABLE/gi)).toHaveLength(1);
    expect(up.match(/CREATE\s+TYPE/gi)).toHaveLength(2);
    expect(up).toContain(`"${SUGGESTION_TABLE}"`);
    expect(up).toContain('"suggestion_status"');
    expect(up).toContain('"suggestion_target_kind"');
    expect(up).toMatch(
      /ALTER\s+TYPE\s+(?:"public"\.)?"counter_name"\s+ADD\s+VALUE\s+'suggestion'/i,
    );
    expect(up).not.toMatch(/\bDROP\b/i);
    expect(up).not.toMatch(/ALTER\s+TABLE\s+"(?!suggestions")/i);
  });

  it("ADD VALUE n'est pas suivi d'un INSERT/UPDATE utilisant la nouvelle valeur (même transaction)", () => {
    const up = code(sqlOf(migration(), "migration.sql"));
    expect(up).not.toMatch(/\b(?:INSERT|UPDATE)\b[^;]*project_counters/i);
  });

  it("down.sql retire la table et les deux enums, purge les compteurs suggestion et recrée counter_name", () => {
    const down = code(sqlOf(migration(), "down.sql"));
    expect(down).toMatch(/DROP TABLE (?:IF EXISTS )?(?:"public"\.)?"suggestions"/i);
    expect(down).toMatch(/DROP TYPE (?:IF EXISTS )?(?:"public"\.)?"suggestion_status"/i);
    expect(down).toMatch(/DROP TYPE (?:IF EXISTS )?(?:"public"\.)?"suggestion_target_kind"/i);
    expect(down).toMatch(
      /DELETE FROM (?:"public"\.)?"project_counters" WHERE "name"::text = 'suggestion'/i,
    );
    expect(down).toMatch(/RENAME TO "counter_name_old"/i);
    expect(down).toMatch(
      /CREATE TYPE (?:"public"\.)?"counter_name" AS ENUM \('ticket',\s*'sprint',\s*'feature'\)/i,
    );
    expect(down).toMatch(/DROP TYPE (?:"public"\.)?"counter_name_old"/i);
    // La table disparaît avant les enums qu'elle utilise.
    expect(down.search(/DROP TABLE/i)).toBeLessThan(down.search(/DROP TYPE/i));
  });

  it("expectedTables contient la table (38 au total avec TK-51c)", () => {
    expect(expectedTables).toContain(SUGGESTION_TABLE);
    expect(expectedTables).toHaveLength(38);
  });
});

let db: TestDatabase;
let baseline: TestDatabase;
let afterFirstUp: Awaited<ReturnType<typeof inventory>>;
let scope: Awaited<ReturnType<typeof suggestionScope>>;
let suggestionId: string;

beforeAll(async () => {
  db = await createTestDatabase();
  baseline = await createTestDatabase();
}, 180_000);

afterAll(async () => {
  await db?.dispose();
  await baseline?.dispose();
}, 60_000);

describe("TK-51b migration suggestions : up -> (données) -> down -> up", () => {
  it("deploy sur base vide crée la table, les enums et la valeur suggestion", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    afterFirstUp = await inventory(db);
    expect(afterFirstUp.tables).toEqual([...expectedTables].sort());
    expect(afterFirstUp.tables).toContain(SUGGESTION_TABLE);
    expect(afterFirstUp.enums).toContain(`suggestion_status:${SUGGESTION_STATUSES.join(",")}`);
    expect(afterFirstUp.enums).toContain(
      `suggestion_target_kind:${SUGGESTION_TARGET_KINDS.join(",")}`,
    );
    expect(afterFirstUp.enums).toContain(COUNTER_NAMES_AFTER);
    expect(afterFirstUp.enums).not.toContain(COUNTER_NAMES_BEFORE);
  }, 180_000);

  it("down.sql ramène exactement à l'état précédent ; les compteurs ticket, sprint, feature survivent", async () => {
    const expected = await inventory(await applyEarlierMigrations(baseline));
    scope = await suggestionScope(db, "cycle");
    await insertCounter(db, scope, "ticket", 3);
    await insertCounter(db, scope, "sprint", 2);
    await insertCounter(db, scope, "feature", 4);
    await insertCounter(db, scope, "suggestion", 5);
    suggestionId = await insertSuggestion(db, scope, { key: "SG-5" });

    await rollBackFromSuggestions(db);

    expect(await inventory(db)).toEqual(expected);
    expect((await inventory(db)).enums).toContain(COUNTER_NAMES_BEFORE);
    expect(await counters(db, scope.projectId)).toEqual([
      { name: "feature", last_value: 4 },
      { name: "sprint", last_value: 2 },
      { name: "ticket", last_value: 3 },
    ]);
    const kept = await db.query("SELECT 1 FROM projects WHERE id = $1", [scope.projectId]);
    expect(kept).toHaveLength(1);
  }, 180_000);

  it("la colonne project_counters.name reste NOT NULL, de type counter_name, avec sa clé primaire", async () => {
    const [column] = await db.query<{ udt_name: string; is_nullable: string }>(
      `SELECT udt_name, is_nullable FROM information_schema.columns
       WHERE table_name = 'project_counters' AND column_name = 'name'`,
    );
    expect(column).toEqual({ udt_name: "counter_name", is_nullable: "NO" });
    const [pk] = await db.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = 'project_counters'::regclass AND contype = 'p'`,
    );
    expect(pk?.def).toMatch(/PRIMARY KEY \(project_id, name\)/);
  });
});

describe("TK-51b migration suggestions : second up", () => {
  it("second deploy : même inventaire qu'au premier up, compteurs conservés, table vide", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    expect(await inventory(db)).toEqual(afterFirstUp);
    expect(await counters(db, scope.projectId)).toEqual([
      { name: "feature", last_value: 4 },
      { name: "sprint", last_value: 2 },
      { name: "ticket", last_value: 3 },
    ]);
    const [row] = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${SUGGESTION_TABLE}`,
    );
    expect(row?.n).toBe("0");
    expect(suggestionId).toBeDefined();
    // Le compteur suggestion est de nouveau utilisable après le second up.
    await insertCounter(db, scope, "suggestion", 0);
  }, 180_000);
});

describe("TK-51b migration suggestions : schéma Prisma", () => {
  it("migrate diff entre la base et schema.prisma est vide (code 0)", () => {
    expect(afterFirstUp?.tables, "la table doit exister avant de comparer").toContain(
      SUGGESTION_TABLE,
    );
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 120_000);

  it("schema.prisma déclare le modèle Suggestion, ses deux enums et la valeur suggestion de CounterName", () => {
    const schema = readFileSync(schemaPath, "utf8");
    expect(schema).toMatch(/model Suggestion \{[\s\S]*?@@map\("suggestions"\)/);
    expect(schema).toMatch(/enum SuggestionStatus \{[\s\S]*?@@map\("suggestion_status"\)/);
    expect(schema).toMatch(/enum SuggestionTargetKind \{[\s\S]*?@@map\("suggestion_target_kind"\)/);
    expect(schema).toMatch(/enum CounterName \{[^}]*\bsuggestion\b[^}]*\}/);
  });
});
