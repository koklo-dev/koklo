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
  CREDENTIALS_SUFFIX,
  insertCredential,
  insertState,
  OAUTH_TABLES,
  oauthScene,
  STATES_SUFFIX,
} from "./support/oauth-fixtures.ts";

/**
 * TK-48a1 AC-48-02/04 : deux migrations additives, `*_provider_auth_states` puis
 * `*_provider_user_credentials`, chacune avec un `down.sql` (retour exact), rejouables
 * (up -> down -> up) et sans écart avec `schema.prisma` (`migrate diff` vide). Les index partiels
 * et les CHECK sont écrits à la main : Prisma ne sait pas les exprimer.
 */
const PREVIOUS = "_webhook_installation_index";
const dirs = () => listMigrationDirs();
const dirOf = (suffix: string) => dirs().find((dir) => dir.endsWith(suffix)) as string;
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

/** Référence : les migrations antérieures à celles de TK-48a1 seules, appliquées à la main. */
async function applyEarlierMigrations(target: TestDatabase): Promise<TestDatabase> {
  for (const dir of dirs().filter(
    (d) => d < dirOf(STATES_SUFFIX) && d < dirOf(CREDENTIALS_SUFFIX),
  )) {
    runPrismaOrThrow(
      ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
      target.url,
    );
  }
  return target;
}

async function rollBack(db: TestDatabase, dir: string): Promise<void> {
  runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
  await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
}

describe("TK-48a1 migrations : dossiers et contenu", () => {
  it("deux dossiers horodatés, après webhook_installation_index, avec un down.sql non vide", () => {
    const previous = dirOf(PREVIOUS);
    for (const suffix of [STATES_SUFFIX, CREDENTIALS_SUFFIX]) {
      const dir = dirOf(suffix);
      expect(dir, `dossier *${suffix}`).toBeDefined();
      expect(dir).toMatch(new RegExp(`^\\d{14}${suffix}$`));
      expect(dir > previous).toBe(true);
      expect(sqlOf(dir, "down.sql").trim().length).toBeGreaterThan(0);
    }
  });

  it("les états précèdent les jetons (ordre stable pour le retour arrière)", () => {
    expect(dirOf(STATES_SUFFIX) < dirOf(CREDENTIALS_SUFFIX)).toBe(true);
  });

  it("chaque migration ne crée que sa table, sans DROP ni ALTER d'une table existante", () => {
    for (const [suffix, table] of [
      [STATES_SUFFIX, "provider_auth_states"],
      [CREDENTIALS_SUFFIX, "provider_user_credentials"],
    ] as const) {
      const up = code(sqlOf(dirOf(suffix), "migration.sql"));
      expect(up.match(/CREATE\s+TABLE/gi), table).toHaveLength(1);
      expect(up).toContain(`"${table}"`);
      expect(up).not.toMatch(/\bDROP\b/i);
      expect(up).not.toMatch(/ALTER\s+TABLE\s+"(?!provider_(auth_states|user_credentials)")/i);
    }
  });

  it("down.sql ne supprime que la table de sa migration", () => {
    expect(code(sqlOf(dirOf(STATES_SUFFIX), "down.sql")).trim()).toMatch(
      /^DROP TABLE (?:IF EXISTS )?(?:"public"\.)?"provider_auth_states"(?: CASCADE)?;?$/i,
    );
    expect(code(sqlOf(dirOf(CREDENTIALS_SUFFIX), "down.sql")).trim()).toMatch(
      /^DROP TABLE (?:IF EXISTS )?(?:"public"\.)?"provider_user_credentials"(?: CASCADE)?;?$/i,
    );
  });

  it("expectedTables contient les deux tables (40 au total avec TK-55a)", () => {
    for (const table of OAUTH_TABLES) expect(expectedTables).toContain(table);
    expect(expectedTables).toHaveLength(40);
  });
});

const LATER_ENUMS = [
  "llm_provider",
  "suggestion_status",
  "suggestion_target_kind",
  "review_target_kind",
  "review_status",
  "baseline_status",
];

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

describe("TK-48a1 migrations : up -> (données) -> down -> up", () => {
  it("deploy sur base vide crée les deux tables, tout le reste est inchangé", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    afterFirstUp = await inventory(db);
    for (const table of OAUTH_TABLES) expect(afterFirstUp.tables).toContain(table);
    expect(afterFirstUp.tables).toEqual([...expectedTables].sort());
    // TK-51a/b/c ajoutent des types : seuls écarts d'enums attendus avec la base de référence.
    expect(afterFirstUp.enums.filter((name) => !LATER_ENUMS.includes(name))).toEqual(
      (await inventory(await applyEarlierMigrations(baseline))).enums,
    );
  }, 180_000);

  it("down.sql défait chaque migration dans l'ordre inverse : retour exact, données des autres tables conservées", async () => {
    const expected = await inventory(baseline);
    const scene = await oauthScene(db, "cycle");
    await insertState(db, scene);
    await insertCredential(db, scene);

    // Les migrations postérieures sont défaites d'abord (de la plus récente à la plus ancienne).
    for (const later of dirs()
      .filter((d) => d > dirOf(CREDENTIALS_SUFFIX))
      .reverse()) {
      await rollBack(db, later);
    }
    await rollBack(db, dirOf(CREDENTIALS_SUFFIX));
    expect((await inventory(db)).tables).not.toContain("provider_user_credentials");
    expect((await inventory(db)).tables).toContain("provider_auth_states");
    await rollBack(db, dirOf(STATES_SUFFIX));

    expect(await inventory(db)).toEqual(expected);
    const kept = await db.query("SELECT 1 FROM provider_installations WHERE id = $1", [
      scene.installationId,
    ]);
    expect(kept).toHaveLength(1);
  }, 180_000);

  it("second deploy : même inventaire qu'au premier up, tables vides", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    expect(await inventory(db)).toEqual(afterFirstUp);
    for (const table of OAUTH_TABLES) {
      const [row] = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`);
      expect(row?.n, table).toBe("0");
    }
  }, 180_000);

  it("migrate diff entre la base et schema.prisma est vide (code 0)", () => {
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 120_000);

  it("schema.prisma déclare les deux modèles, mappés sur leurs tables", () => {
    const schema = readFileSync(schemaPath, "utf8");
    expect(schema).toMatch(/model ProviderAuthState \{[\s\S]*?@@map\("provider_auth_states"\)/);
    expect(schema).toMatch(
      /model ProviderUserCredential \{[\s\S]*?@@map\("provider_user_credentials"\)/,
    );
  });
});
