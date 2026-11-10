import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as dbPackage from "../src/index.ts";
import {
  expectedTables,
  listMigrationDirs,
  migrationsDir,
  runPrisma,
  runPrismaOrThrow,
  schemaPath,
} from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { notificationScope } from "./support/notifications-fixtures.ts";
import { secondProject } from "./support/project-client-fixtures.ts";
import { sqlState } from "./support/ticket-fixtures.ts";

/**
 * TK-93 (lot A1, B301) : migration `*_project_creations` : `projects.eu_only` (B304) et la table
 * `project_creations` (création du dépôt de spec par le worker). `down.sql` non vide, rejouable
 * (up, down, up), CHECK écrits à la main, clés composites comme `project_visits`, unicité de la
 * clé d'idempotence par organisation.
 */
const SUFFIX = "_project_creations";
const TABLE = "project_creations";
const FOREIGN_KEY = "23503";
const UNIQUE = "23505";
const CHECK = "23514";

const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, migration(), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

describe("TK-93 migration project_creations : dossier et contenu", () => {
  it("existe, après 20261109090000_idea_versions, avec un down.sql non vide", () => {
    expect(migration(), "dossier de migration *_project_creations").toBeDefined();
    const previous = dirs().find((dir) => dir.endsWith("_idea_versions")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql : une table, eu_only, CHECK écrits en SQL, sans enum ni fonction ni trigger", () => {
    const up = code(sqlOf("migration.sql"));
    expect(up.match(/CREATE\s+TABLE/gi)).toHaveLength(1);
    expect(up).toContain(`CREATE TABLE "${TABLE}"`);
    expect(up).toMatch(
      /ALTER TABLE "projects" ADD COLUMN\s+"eu_only" BOOLEAN NOT NULL DEFAULT false/i,
    );
    expect(up.match(/CHECK\s*\(/gi)?.length).toBeGreaterThanOrEqual(4);
    expect(up).not.toMatch(/CREATE\s+TYPE|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|CREATE\s+TRIGGER/i);
    expect(up).not.toMatch(/\bjsonb?\b|GENERATED/i);
  });

  it("down.sql retire la table puis la colonne, rien d'autre", () => {
    const down = code(sqlOf("down.sql"));
    expect(down).toMatch(/DROP TABLE (?:IF EXISTS )?(?:"public"\.)?"project_creations"/i);
    expect(down).toMatch(
      /ALTER TABLE (?:"public"\.)?"projects" DROP COLUMN (?:IF EXISTS )?"eu_only"/i,
    );
    expect(down).not.toMatch(/DROP\s+(?:TYPE|FUNCTION|TRIGGER)/i);
  });

  it("expectedTables contient la table (57 au total)", () => {
    expect(expectedTables).toContain(TABLE);
    expect(expectedTables).toHaveLength(57);
  });

  it("le modèle ProjectCreation est un modèle d'organisation", () => {
    expect(dbPackage.TENANT_MODELS).toContain("ProjectCreation");
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
  };
}

interface CreationRow {
  organizationId: string;
  projectId: string;
  userId: string;
  status?: string;
  errorCode?: string | null;
  retryAfterMs?: number | null;
  repoName?: string;
  ideaTemplate?: string;
  idempotencyKey?: string | null;
}

const insertCreation = (target: Pick<TestDatabase, "query">, o: CreationRow) =>
  target.query(
    `INSERT INTO project_creations (id, organization_id, project_id, status, error_code, retry_after_ms,
       repo_name, idea_template, idempotency_key, requested_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())`,
    [
      randomUUID(),
      o.organizationId,
      o.projectId,
      o.status ?? "pending",
      o.errorCode ?? null,
      o.retryAfterMs ?? null,
      o.repoName ?? "mon-projet-spec",
      o.ideaTemplate ?? "default",
      o.idempotencyKey ?? null,
      o.userId,
    ],
  );

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: cycle up, down, up d'une même migration, un test par étape
describe("TK-93 migration project_creations : up, down, up", () => {
  let afterFirstUp: Awaited<ReturnType<typeof inventory>>;

  it("deploy crée la table, la colonne eu_only (faux par défaut) et l'index décroissant", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    afterFirstUp = await inventory(db);
    expect(afterFirstUp.tables).toEqual([...expectedTables].sort());
    const columns = afterFirstUp.columns.filter((c) => c.startsWith(`${TABLE}.`));
    expect(columns.map((c) => c.split(" ")[0]).sort()).toEqual(
      [
        "created_at",
        "error_code",
        "id",
        "idea_template",
        "idempotency_key",
        "installation_id",
        "invitation_failed",
        "organization_id",
        "project_id",
        "repo_name",
        "requested_by",
        "retry_after_ms",
        "status",
        "updated_at",
      ].map((c) => `${TABLE}.${c}`),
    );
    expect(afterFirstUp.columns).toContain("projects.eu_only bool null=NO default=false");
    const indexes = afterFirstUp.indexes.filter((i) => i.includes(` ON public.${TABLE} `));
    expect(
      indexes.some((i) => /\(organization_id, project_id, created_at DESC\)/.test(i)),
      indexes.join("\n"),
    ).toBe(true);
    expect(
      indexes.some((i) => /UNIQUE INDEX.*\(organization_id, idempotency_key\)/.test(i)),
      indexes.join("\n"),
    ).toBe(true);
    const keys = afterFirstUp.constraints.filter((c) => c.startsWith(`${TABLE}.`));
    expect(
      keys.some((c) =>
        c.includes(
          "FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id) ON DELETE CASCADE",
        ),
      ),
    ).toBe(true);
  }, 180_000);

  it("down.sql ramène exactement à l'état précédent ; les projets survivent", async () => {
    for (const dir of dirs().filter((d) => d < migration())) {
      runPrismaOrThrow(
        ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
        baseline.url,
      );
    }
    const expected = await inventory(baseline);
    const scope = await notificationScope(db, "creations-cycle");
    await insertCreation(db, scope);

    for (const dir of dirs()
      .filter((d) => d >= migration())
      .reverse()) {
      runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, "down.sql")], db.url);
      await db.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [dir]);
    }

    expect(await inventory(db)).toEqual(expected);
    expect(await db.query("SELECT 1 FROM projects WHERE id = $1", [scope.projectId])).toHaveLength(
      1,
    );
  }, 180_000);

  it("second deploy : même inventaire, table vide et utilisable", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    expect(await inventory(db)).toEqual(afterFirstUp);
    const [count] = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${TABLE}`);
    expect(count?.n).toBe("0");
  }, 180_000);

  it("migrate diff entre la base et schema.prisma est vide (code 0)", () => {
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 120_000);

  it("schema.prisma déclare ProjectCreation sans champ Json", () => {
    const schema = readFileSync(schemaPath, "utf8");
    const model = schema.match(/model ProjectCreation \{([\s\S]*?)\n\}/);
    expect(model?.[0]).toMatch(/@@map\("project_creations"\)/);
    expect(model?.[1]).not.toMatch(/\bJson\b/);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même table, un test par contrainte
describe("TK-93 project_creations : contraintes", () => {
  it("projects.eu_only vaut faux pour un projet créé sans la colonne", async () => {
    const scope = await notificationScope(db, "creations-eu");
    const [row] = await db.query<{ eu_only: boolean }>(
      "SELECT eu_only FROM projects WHERE id = $1",
      [scope.projectId],
    );
    expect(row?.eu_only).toBe(false);
  });

  it("CHECK : statut, code d'erreur, modèle d'idée, délai négatif et nom de dépôt trop long refusés", async () => {
    const scope = await notificationScope(db, "creations-check");
    expect(await sqlState(() => insertCreation(db, { ...scope, status: "bof" }))).toBe(CHECK);
    expect(await sqlState(() => insertCreation(db, { ...scope, errorCode: "inconnu" }))).toBe(
      CHECK,
    );
    expect(await sqlState(() => insertCreation(db, { ...scope, ideaTemplate: "autre" }))).toBe(
      CHECK,
    );
    expect(await sqlState(() => insertCreation(db, { ...scope, retryAfterMs: -1 }))).toBe(CHECK);
    expect(await sqlState(() => insertCreation(db, { ...scope, repoName: "x".repeat(101) }))).toBe(
      CHECK,
    );
    for (const status of ["pending", "running", "succeeded", "failed", "skipped"]) {
      await insertCreation(db, { ...scope, status });
    }
    await insertCreation(db, {
      ...scope,
      status: "failed",
      errorCode: "name_taken",
      retryAfterMs: 0,
    });
  });

  it("unicité de la clé d'idempotence par organisation ; absente = plusieurs lignes", async () => {
    const a = await notificationScope(db, "creations-idem-a");
    const b = await notificationScope(db, "creations-idem-b");
    await insertCreation(db, { ...a, idempotencyKey: "k1" });
    expect(await sqlState(() => insertCreation(db, { ...a, idempotencyKey: "k1" }))).toBe(UNIQUE);
    await insertCreation(db, { ...b, idempotencyKey: "k1" });
    await insertCreation(db, a);
    await insertCreation(db, a);
  });

  it("tenant : un projet d'une autre organisation est refusé (clé composite)", async () => {
    const a = await notificationScope(db, "creations-fk-a");
    const b = await notificationScope(db, "creations-fk-b");
    expect(await sqlState(() => insertCreation(db, { ...a, projectId: b.projectId }))).toBe(
      FOREIGN_KEY,
    );
    await insertCreation(db, { ...a, projectId: await secondProject(db, a, "creations-2") });
  });

  it("supprimer le projet supprime ses créations (cascade)", async () => {
    const scope = await notificationScope(db, "creations-cascade");
    await insertCreation(db, scope);
    await db.query("DELETE FROM projects WHERE id = $1", [scope.projectId]);
    expect(
      await db.query(`SELECT 1 FROM ${TABLE} WHERE project_id = $1`, [scope.projectId]),
    ).toHaveLength(0);
  });
});
