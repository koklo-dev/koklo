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
  insertLlmCredential,
  LLM_MIGRATION,
  LLM_SUFFIX,
  LLM_TABLE,
  llmScope,
} from "./support/llm-credentials-fixtures.ts";

/**
 * TK-51a : migration additive `20261101090000_llm_provider_credentials` : une table
 * `llm_provider_credentials` et un enum `llm_provider`, avec un `down.sql` (retour exact),
 * rejouable (up -> down -> up), sans écart avec `schema.prisma` (`migrate diff` vide). Les CHECK
 * sont écrits à la main : Prisma ne sait pas les exprimer.
 */
const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(LLM_SUFFIX)) as string;
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

/** Référence : les migrations antérieures à celle de TK-51a seules, appliquées à la main. */
async function applyEarlierMigrations(target: TestDatabase): Promise<TestDatabase> {
  for (const dir of dirs().filter((d) => d < migration())) {
    runPrismaOrThrow(
      ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
      target.url,
    );
  }
  return target;
}

describe("TK-51a migration llm_provider_credentials : dossier et contenu", () => {
  it("existe sous le nom 20261101090000_llm_provider_credentials, après provider_user_credentials", () => {
    expect(migration(), "dossier de migration *_llm_provider_credentials").toBeDefined();
    expect(migration()).toBe(LLM_MIGRATION);
    const previous = dirs().find((dir) => dir.endsWith("_provider_user_credentials")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf(migration(), "down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql crée une seule table et un seul enum, sans DROP ni ALTER d'une table existante", () => {
    const up = code(sqlOf(migration(), "migration.sql"));
    expect(up.match(/CREATE\s+TABLE/gi)).toHaveLength(1);
    expect(up.match(/CREATE\s+TYPE/gi)).toHaveLength(1);
    expect(up).toContain(`"${LLM_TABLE}"`);
    expect(up).toContain('"llm_provider"');
    expect(up).not.toMatch(/\bDROP\b/i);
    expect(up).not.toMatch(/ALTER\s+TABLE\s+"(?!llm_provider_credentials")/i);
    expect(up).not.toMatch(/ALTER\s+TYPE/i);
  });

  it("down.sql supprime la table puis l'enum, rien d'autre", () => {
    const down = code(sqlOf(migration(), "down.sql"))
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    expect(down).toHaveLength(2);
    expect(down[0]).toMatch(
      /^DROP TABLE (?:IF EXISTS )?(?:"public"\.)?"llm_provider_credentials"(?: CASCADE)?$/i,
    );
    expect(down[1]).toMatch(/^DROP TYPE (?:IF EXISTS )?(?:"public"\.)?"llm_provider"$/i);
  });

  it("expectedTables contient la table (36 au total avec TK-51b)", () => {
    expect(expectedTables).toContain(LLM_TABLE);
    expect(expectedTables).toHaveLength(36);
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

describe("TK-51a migration llm_provider_credentials : up -> (données) -> down -> up", () => {
  it("deploy sur base vide crée la table et l'enum anthropic, openai, google", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    afterFirstUp = await inventory(db);
    expect(afterFirstUp.tables).toEqual([...expectedTables].sort());
    expect(afterFirstUp.tables).toContain(LLM_TABLE);
    expect(afterFirstUp.enums).toContain("llm_provider:anthropic,openai,google");
  }, 180_000);

  it("down.sql ramène exactement à l'état précédent, données des autres tables conservées", async () => {
    const expected = await inventory(await applyEarlierMigrations(baseline));
    const scope = await llmScope(db, "cycle");
    await insertLlmCredential(db, { organizationId: scope.organizationId });

    // Les migrations postérieures (TK-51b) sont défaites d'abord, de la plus récente à la plus ancienne.
    for (const dir of dirs()
      .filter((d) => d >= migration())
      .reverse()) {
      runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }

    expect(await inventory(db)).toEqual(expected);
    const kept = await db.query("SELECT 1 FROM projects WHERE id = $1", [scope.projectId]);
    expect(kept).toHaveLength(1);
  }, 180_000);

  it("second deploy : même inventaire qu'au premier up, table vide", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    expect(await inventory(db)).toEqual(afterFirstUp);
    const [row] = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${LLM_TABLE}`);
    expect(row?.n).toBe("0");
  }, 180_000);

  it("migrate diff entre la base et schema.prisma est vide (code 0)", () => {
    expect(afterFirstUp?.tables, "la table doit exister avant de comparer").toContain(LLM_TABLE);
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 120_000);

  it("schema.prisma déclare le modèle LlmProviderCredential et l'enum LlmProvider", () => {
    const schema = readFileSync(schemaPath, "utf8");
    expect(schema).toMatch(
      /model LlmProviderCredential \{[\s\S]*?@@map\("llm_provider_credentials"\)/,
    );
    expect(schema).toMatch(/enum LlmProvider \{[\s\S]*?@@map\("llm_provider"\)/);
  });
});
