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
import { secondClient, secondProject } from "./support/project-client-fixtures.ts";
import { sqlState } from "./support/ticket-fixtures.ts";

/**
 * TK-88 (lot A, A1 et A2) : migration `*_project_visits` (dernier projet ouvert par membre, B80).
 * Une table, ni enum, ni fonction, ni trigger, ni colonne générée. `down.sql` la retire seule ;
 * rejouable (up, down, up) ; `migrate diff` vide ; clés étrangères composites (jamais d'écart
 * d'organisation) ; une ligne par (projet, membre).
 */
const SUFFIX = "_project_visits";
const TABLE = "project_visits";
const FOREIGN_KEY = "23503";
const UNIQUE = "23505";

const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, migration(), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");

describe("TK-88 migration project_visits : dossier et contenu", () => {
  it("existe, après 20261107120000_audit_project, avec un down.sql non vide", () => {
    expect(migration(), "dossier de migration *_project_visits").toBeDefined();
    const previous = dirs().find((dir) => dir.endsWith("_audit_project")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql crée une table sans enum, fonction, trigger, colonne générée ni donnée", () => {
    const up = code(sqlOf("migration.sql"));
    expect(up.match(/CREATE\s+TABLE/gi)).toHaveLength(1);
    expect(up).toContain(`CREATE TABLE "${TABLE}"`);
    expect(up).not.toMatch(/CREATE\s+TYPE|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|CREATE\s+TRIGGER/i);
    expect(up).not.toMatch(/GENERATED|\bDROP\b|ALTER\s+TYPE|\bjsonb?\b/i);
    expect(up).not.toMatch(/\b(?:INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+"[a-z_]+"\s+SET)/i);
  });

  it("down.sql retire seulement la table project_visits", () => {
    const down = code(sqlOf("down.sql"));
    expect(down.match(/DROP\s+TABLE/gi)).toHaveLength(1);
    expect(down).toMatch(/DROP TABLE (?:IF EXISTS )?(?:"public"\.)?"project_visits"/i);
    expect(down).not.toMatch(/DROP\s+(?:TYPE|FUNCTION|TRIGGER)/i);
  });

  it("expectedTables contient la table (46 au total)", () => {
    expect(expectedTables).toContain(TABLE);
    expect(expectedTables).toHaveLength(46);
  });

  it("le modèle ProjectVisit est un modèle d'organisation", () => {
    expect(dbPackage.TENANT_MODELS).toContain("ProjectVisit");
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
    triggers: await rows("SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1"),
  };
}

const insertVisit = (
  target: Pick<TestDatabase, "query">,
  o: { organizationId: string; projectId: string; userId: string },
) =>
  target.query(
    `INSERT INTO project_visits (id, organization_id, project_id, user_id, visited_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now(), now())`,
    [randomUUID(), o.organizationId, o.projectId, o.userId],
  );

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: cycle up, down, up d'une même migration, un test par étape
describe("TK-88 migration project_visits : up, down, up", () => {
  let afterFirstUp: Awaited<ReturnType<typeof inventory>>;

  it("deploy crée la table avec ses colonnes, son unicité et son index décroissant", async () => {
    runPrismaOrThrow(["migrate", "deploy"], db.url);
    afterFirstUp = await inventory(db);
    expect(afterFirstUp.tables).toEqual([...expectedTables].sort());
    const columns = afterFirstUp.columns.filter((c) => c.startsWith(`${TABLE}.`));
    expect(columns.map((c) => c.split(" ")[0]).sort()).toEqual(
      [
        "created_at",
        "id",
        "organization_id",
        "project_id",
        "updated_at",
        "user_id",
        "visited_at",
      ].map((c) => `${TABLE}.${c}`),
    );
    expect(columns.find((c) => c.startsWith(`${TABLE}.visited_at`))).toContain("timestamptz");
    const indexes = afterFirstUp.indexes.filter((i) => i.includes(` ON public.${TABLE} `));
    expect(indexes.some((i) => /UNIQUE INDEX.*\(project_id, user_id\)/.test(i))).toBe(true);
    expect(
      indexes.some((i) => /\(organization_id, user_id, visited_at DESC\)/.test(i)),
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
    expect(
      keys.some((c) =>
        c.includes(
          "FOREIGN KEY (organization_id, user_id) REFERENCES members(organization_id, user_id) ON DELETE CASCADE",
        ),
      ),
    ).toBe(true);
  }, 180_000);

  it("down.sql ramène exactement à l'état précédent ; les projets et membres survivent", async () => {
    // Référence : toutes les migrations antérieures seules.
    for (const dir of dirs().filter((d) => d < migration())) {
      runPrismaOrThrow(
        ["db", "execute", "--file", join(migrationsDir, dir, "migration.sql")],
        baseline.url,
      );
    }
    const expected = await inventory(baseline);
    const scope = await notificationScope(db, "visits-cycle");
    await insertVisit(db, scope);

    // Les migrations postérieures (TK-97) sont défaites d'abord, de la plus récente à la plus ancienne.
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
    expect(await db.query("SELECT 1 FROM members WHERE user_id = $1", [scope.userId])).toHaveLength(
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

  it("schema.prisma déclare ProjectVisit sans champ Json ni nouvel enum", () => {
    const schema = readFileSync(schemaPath, "utf8");
    const model = schema.match(/model ProjectVisit \{([\s\S]*?)\n\}/);
    expect(model?.[0]).toMatch(/@@map\("project_visits"\)/);
    expect(model?.[1]).not.toMatch(/\bJson\b/);
  });
});

describe("TK-88 project_visits : contraintes", () => {
  it("A2 : une seule ligne par (projet, membre) ; un autre membre ou projet est accepté", async () => {
    const scope = await notificationScope(db, "visits-unique");
    await insertVisit(db, scope);
    expect(await sqlState(() => insertVisit(db, scope))).toBe(UNIQUE);
    const other = await secondClient(db, scope, "visits-other");
    await insertVisit(db, { ...scope, userId: other });
    await insertVisit(db, { ...scope, projectId: await secondProject(db, scope, "visits-2") });
  });

  it("A2 : un projet d'une autre organisation ou un non-membre est refusé (clé composite)", async () => {
    const a = await notificationScope(db, "visits-fk-a");
    const b = await notificationScope(db, "visits-fk-b");
    expect(await sqlState(() => insertVisit(db, { ...a, projectId: b.projectId }))).toBe(
      FOREIGN_KEY,
    );
    expect(await sqlState(() => insertVisit(db, { ...a, userId: b.userId }))).toBe(FOREIGN_KEY);
  });

  it("supprimer le projet supprime ses visites (cascade)", async () => {
    const scope = await notificationScope(db, "visits-cascade");
    await insertVisit(db, scope);
    await db.query("DELETE FROM projects WHERE id = $1", [scope.projectId]);
    expect(
      await db.query(`SELECT 1 FROM ${TABLE} WHERE project_id = $1`, [scope.projectId]),
    ).toHaveLength(0);
  });
});
