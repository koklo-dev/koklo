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
  AI_SUFFIX,
  AI_TABLES,
  AI_USAGE_VALUES,
  insertCredential,
  LLM_PROVIDER_VALUES,
} from "./support/ai-providers-fixtures.ts";
import { insertLlmCredential } from "./support/llm-credentials-fixtures.ts";
import { insertScope } from "./support/ticket-fixtures.ts";

/**
 * TK-95 (lot C) : migration `*_ai_providers`. Enum `llm_provider` élargi (mistral, openrouter,
 * openai_compatible), `base_url` sur les clés, trois tables (réglages, modèle par usage, consommation
 * mensuelle), migration de données (la clé Anthropic existante devient Principal). `down.sql`
 * réversible (up -> down -> up), `migrate diff` vide, aucune colonne générée.
 */
const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(AI_SUFFIX)) as string;
const sqlOf = (dir: string, file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, dir, file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");
const SONNET = "claude-sonnet-5-5";

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

/** Applique à la main les migrations strictement antérieures à celle de TK-95. */
function applyEarlierMigrations(target: TestDatabase): TestDatabase {
  for (const dir of dirs().filter((d) => d < migration())) {
    runPrismaOrThrow(
      ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
      target.url,
    );
  }
  return target;
}

/** Une organisation avec une clé Anthropic et des clés des fournisseurs ajoutés (perdues au retour arrière). */
async function seedNewProviderKeys(target: TestDatabase): Promise<void> {
  const scope = await insertScope(target, "ai-cycle");
  await insertCredential(target, scope.organizationId, "mistral");
  await insertCredential(target, scope.organizationId, "openai_compatible", {
    baseUrl: "https://llm.example.org/v1",
  });
  await insertLlmCredential(target, {
    organizationId: scope.organizationId,
    provider: "anthropic",
  });
}

/** Clé telle qu'avant la migration : la colonne `base_url` n'existe pas encore. */
async function insertLegacyKey(
  target: TestDatabase,
  organizationId: string,
  provider: string,
  defaultModel: string | null = null,
): Promise<void> {
  await target.query(
    `INSERT INTO llm_provider_credentials (id, organization_id, provider, ciphertext, nonce,
       key_version, default_model, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2::llm_provider, $3, $4, 1, $5, now(), now())`,
    [organizationId, provider, Buffer.alloc(40, 3), Buffer.alloc(12, 5), defaultModel],
  );
}

const sortedUsages = (model: string) =>
  [...AI_USAGE_VALUES].sort().map((usage) => ({ usage, provider: "anthropic", model }));

const usagesOf = (target: TestDatabase, organizationId: string) =>
  target.query<{ usage: string; provider: string; model: string }>(
    `SELECT usage::text AS usage, provider::text AS provider, model
     FROM ai_usage_models WHERE organization_id = $1 ORDER BY usage`,
    [organizationId],
  );

describe("TK-95 migration ai_providers : dossier et contenu", () => {
  it("existe, après 20261106150913_long_lists, avec un down.sql non vide", () => {
    expect(migration(), "dossier de migration *_ai_providers").toBeDefined();
    const previous = dirs().find((dir) => dir.endsWith("_long_lists")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf(migration(), "down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql : trois tables, l'enum élargi, base_url ; aucune colonne générée ni DROP", () => {
    const up = code(sqlOf(migration(), "migration.sql"));
    expect(up.match(/CREATE\s+TABLE/gi)).toHaveLength(3);
    for (const table of AI_TABLES) expect(up).toContain(`"${table}"`);
    for (const value of ["mistral", "openrouter", "openai_compatible"]) {
      expect(up).toMatch(new RegExp(`ADD\\s+VALUE[^;]*'${value}'`, "i"));
    }
    expect(up).toMatch(/ADD\s+COLUMN\s+"base_url"\s+TEXT/i);
    expect(up).not.toMatch(/GENERATED/i);
    expect(up).not.toMatch(/\bDROP\b/i);
  });

  it("les compteurs sont des BIGINT bornés par CHECK (>= 0), calls est un INTEGER", () => {
    const up = code(sqlOf(migration(), "migration.sql"));
    for (const column of ["input_tokens", "output_tokens", "cost_micro_usd"]) {
      expect(up).toMatch(new RegExp(`"${column}"\\s+BIGINT\\s+NOT NULL`, "i"));
      expect(up).toMatch(new RegExp(`CHECK\\s*\\("${column}"\\s*>=\\s*0\\)`, "i"));
    }
    expect(up).toMatch(/"calls"\s+INTEGER\s+NOT NULL/i);
    expect(up).toMatch(/"monthly_cap_micro_usd"\s+BIGINT/i);
  });

  it("expectedTables contient les trois tables (44 au total avec TK-88)", () => {
    for (const table of AI_TABLES) expect(expectedTables).toContain(table);
    expect(expectedTables).toHaveLength(44);
  });

  it("schema.prisma déclare les trois modèles, l'enum AiUsage et les valeurs de LlmProvider", () => {
    const schema = readFileSync(schemaPath, "utf8");
    for (const model of ["AiOrganizationSettings", "AiUsageModel", "AiUsageMonthly"]) {
      expect(schema).toMatch(new RegExp(`model ${model} \\{`));
    }
    expect(schema).toMatch(/enum AiUsage \{[\s\S]*?@@map\("ai_usage"\)/);
    const block = schema.match(/enum LlmProvider \{([\s\S]*?)\}/)?.[1] ?? "";
    for (const value of LLM_PROVIDER_VALUES) expect(block).toContain(value);
  });
});

let db: TestDatabase;
let baseline: TestDatabase;
let seeded: TestDatabase;
let afterFirstUp: Awaited<ReturnType<typeof inventory>>;

beforeAll(async () => {
  db = await createTestDatabase();
  baseline = await createTestDatabase();
  seeded = await createTestDatabase();
}, 180_000);

afterAll(async () => {
  await db?.dispose();
  await baseline?.dispose();
  await seeded?.dispose();
}, 60_000);

describe("TK-95 migration ai_providers : up -> down -> up", () => {
  it("deploy crée les trois tables et l'enum à six valeurs, ai_usage à quatre", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    afterFirstUp = await inventory(db);
    expect(afterFirstUp.tables).toEqual([...expectedTables].sort());
    expect(afterFirstUp.enums).toContain(`llm_provider:${LLM_PROVIDER_VALUES.join(",")}`);
    expect(afterFirstUp.enums).toContain(`ai_usage:${AI_USAGE_VALUES.join(",")}`);
    expect(afterFirstUp.columns.filter((c) => c.startsWith("ai_usage_monthly."))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("calls int4 null=NO"),
        expect.stringContaining("input_tokens int8 null=NO"),
        expect.stringContaining("output_tokens int8 null=NO"),
        expect.stringContaining("cost_micro_usd int8 null=NO"),
      ]),
    );
  }, 180_000);

  it("down.sql ramène exactement à l'état précédent, y compris avec des lignes des nouveaux fournisseurs", async () => {
    const expected = await inventory(applyEarlierMigrations(baseline));
    await seedNewProviderKeys(db);

    // Les migrations postérieures (TK-96) sont défaites d'abord, de la plus récente à la plus ancienne.
    for (const dir of dirs()
      .filter((d) => d >= migration())
      .reverse()) {
      runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }

    expect(await inventory(db)).toEqual(expected);
    const kept = await db.query<{ provider: string }>(
      "SELECT provider::text AS provider FROM llm_provider_credentials",
    );
    expect(kept.map((r) => r.provider)).toEqual(["anthropic"]);
  }, 180_000);

  it("second deploy : même inventaire qu'au premier up", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    expect(await inventory(db)).toEqual(afterFirstUp);
  }, 180_000);

  it("migrate diff entre la base et schema.prisma est vide (code 0)", () => {
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 120_000);
});

describe("TK-95 migration ai_providers : migration de données", () => {
  it("la clé Anthropic existante devient Principal, ses 4 usages pointent dessus (default_model ou Sonnet)", async () => {
    applyEarlierMigrations(seeded);
    const withModel = await insertScope(seeded, "ai-data-model");
    const withoutModel = await insertScope(seeded, "ai-data-default");
    const otherKeyOnly = await insertScope(seeded, "ai-data-other");
    const noKey = await insertScope(seeded, "ai-data-none");
    await insertLegacyKey(seeded, withModel.organizationId, "anthropic", "claude-haiku-4-5");
    await insertLegacyKey(seeded, withoutModel.organizationId, "anthropic");
    await insertLegacyKey(seeded, otherKeyOnly.organizationId, "openai");

    runPrismaOrThrow(
      ["db", "execute", "--file", join(migrationsDir, migration(), "migration.sql")],
      seeded.url,
    );

    const settings = await seeded.query<Record<string, unknown>>(
      `SELECT organization_id, primary_provider::text AS primary_provider, fallback_provider,
              fallback_enabled, monthly_cap_micro_usd, cap_warned_month
       FROM ai_organization_settings ORDER BY organization_id`,
    );
    expect(settings.map((r) => r.organization_id).sort()).toEqual(
      [withModel.organizationId, withoutModel.organizationId].sort(),
    );
    for (const row of settings) {
      expect(row.primary_provider).toBe("anthropic");
      expect(row.fallback_provider).toBeNull();
      expect(row.fallback_enabled).toBe(true);
      expect(row.monthly_cap_micro_usd).toBeNull();
      expect(row.cap_warned_month).toBeNull();
    }

    expect(await usagesOf(seeded, withModel.organizationId)).toEqual(
      sortedUsages("claude-haiku-4-5"),
    );
    expect(await usagesOf(seeded, withoutModel.organizationId)).toEqual(sortedUsages(SONNET));
    expect(await usagesOf(seeded, otherKeyOnly.organizationId)).toEqual([]);
    expect(await usagesOf(seeded, noKey.organizationId)).toEqual([]);

    const [count] = await seeded.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM ai_usage_monthly",
    );
    expect(count?.n).toBe("0");
  }, 180_000);
});
