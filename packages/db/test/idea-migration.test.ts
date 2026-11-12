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
  IDEA_AGENT_SUFFIX,
  IDEA_AGENT_TABLES,
  IDEA_BASE_TABLES,
  IDEA_SUFFIX,
  IDEA_TEMPLATE_SQL,
  IDEA_VERSIONS_SUFFIX,
  IDEA_VERSIONS_TABLES,
} from "./support/idea-fixtures.ts";
import {
  AGENT_PROPOSAL_TABLES,
  DELIVERABLE_OVERRIDE_TABLES,
  PROJECT_CREATION_TABLES,
  SPEC_ENTITY_TABLES,
} from "./support/project-client-fixtures.ts";

/** Tables des migrations qui suivent `*_idea` (agent TK-90, versions TK-91) : absentes de la base de ce test. */
const LATER_TABLES: readonly string[] = [
  ...IDEA_AGENT_TABLES,
  ...IDEA_VERSIONS_TABLES,
  ...PROJECT_CREATION_TABLES,
  ...AGENT_PROPOSAL_TABLES,
  ...DELIVERABLE_OVERRIDE_TABLES,
  ...SPEC_ENTITY_TABLES,
];

import { insertScope } from "./support/ticket-fixtures.ts";

/**
 * TK-89 (lot A, T6) : migration `*_idea`. Quatre tables, deux enums, puis 10 pages vides par projet
 * existant (gabarit « cadrage par défaut », 4 requises). `down.sql` retire tables et enums ; rejouable ;
 * `migrate diff` vide.
 */
const dirs = () => listMigrationDirs();
const migration = () => dirs().find((dir) => dir.endsWith(IDEA_SUFFIX)) as string;
const sqlOf = (file: "migration.sql" | "down.sql") =>
  readFileSync(join(migrationsDir, migration(), file), "utf8");
const code = (sql: string) => sql.replace(/--.*$/gm, "");
const apply = (db: TestDatabase, dir: string, file: "migration.sql" | "down.sql") =>
  runPrismaOrThrow(["db", "execute", "--file", join(migrationsDir, dir, file)], db.url);

describe("TK-89 migration idea : dossier et contenu", () => {
  it("existe, après 20261107170000_settings, avec un down.sql non vide", () => {
    expect(migration(), "dossier de migration *_idea").toBeDefined();
    const previous = dirs().find((dir) => dir.endsWith("_settings")) as string;
    expect(migration() > previous).toBe(true);
    expect(sqlOf("down.sql").trim().length).toBeGreaterThan(0);
  });

  it("migration.sql crée quatre tables et deux enums, ajoute les CHECK et les pages du gabarit", () => {
    const up = code(sqlOf("migration.sql"));
    expect(up.match(/CREATE\s+TABLE/gi)).toHaveLength(4);
    expect(up.match(/CREATE\s+TYPE/gi)).toHaveLength(2);
    for (const table of IDEA_BASE_TABLES) expect(up).toContain(`CREATE TABLE "${table}"`);
    expect(up).not.toMatch(/\bDROP\b|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|CREATE\s+TRIGGER/i);
    expect(up).toMatch(/INSERT INTO "idea_pages"/);
    expect(up).toMatch(/gen_random_uuid\(\)/);
  });

  it("down.sql retire les quatre tables puis les deux enums", () => {
    const down = code(sqlOf("down.sql"));
    for (const table of IDEA_BASE_TABLES) expect(down).toContain(`DROP TABLE "public"."${table}"`);
    expect(down).toContain('DROP TYPE "public"."idea_page_status"');
    expect(down).toContain('DROP TYPE "public"."idea_page_origin"');
    expect(down.search(/DROP TABLE/i)).toBeLessThan(down.search(/DROP TYPE/i));
  });

  it("expectedTables contient les quatre tables (56 au total avec TK-90 et TK-91)", () => {
    for (const table of IDEA_BASE_TABLES) expect(expectedTables).toContain(table);
    expect(expectedTables).toHaveLength(63);
  });
});

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
}, 180_000);
afterAll(async () => {
  await db?.dispose();
}, 60_000);

const tables = async () =>
  (
    await db.query<{ name: string }>(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' ORDER BY 1`,
    )
  ).map((row) => row.name);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("TK-89 migration idea : pages des projets existants", () => {
  it("applique les migrations antérieures, crée deux projets, puis la migration idea", async () => {
    for (const dir of dirs().filter((d) => d < migration())) apply(db, dir, "migration.sql");
    const one = await insertScope(db, "idea-a");
    const two = await insertScope(db, "idea-b");
    apply(db, migration(), "migration.sql");

    for (const scope of [one, two]) {
      const rows = await db.query<{
        slug: string;
        title: string;
        position: number;
        required: boolean;
        origin: string;
        template_key: string;
        status: string;
        content_md: string;
        version: number;
        deleted_at: Date | null;
        organization_id: string;
      }>(
        `SELECT slug, title, position, required, origin::text AS origin, template_key,
                status::text AS status, content_md, version, deleted_at, organization_id
         FROM idea_pages WHERE project_id = $1 ORDER BY position`,
        [scope.projectId],
      );
      expect(rows).toHaveLength(10);
      expect(rows.map((r) => [r.slug, r.title, r.required])).toEqual(
        IDEA_TEMPLATE_SQL.map(([slug, title, required]) => [slug, title, required]),
      );
      expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(rows.filter((r) => r.required).map((r) => r.slug)).toEqual([
        "vision",
        "probleme",
        "utilisateurs",
        "perimetre",
      ]);
      for (const row of rows) {
        expect(row.origin).toBe("template");
        expect(row.template_key).toBe(row.slug);
        expect(row.status).toBe("empty");
        expect(row.content_md).toBe("");
        expect(row.version).toBe(1);
        expect(row.deleted_at).toBeNull();
        expect(row.organization_id).toBe(scope.organizationId);
      }
    }
    expect(await tables()).toEqual(expectedTables.filter((t) => !LATER_TABLES.includes(t)).sort());
  }, 180_000);

  it("down.sql retire les tables, up les recrée avec les pages (rejouable)", async () => {
    apply(db, migration(), "down.sql");
    const afterDown = await tables();
    for (const table of IDEA_BASE_TABLES) expect(afterDown).not.toContain(table);
    expect(afterDown).toHaveLength(
      expectedTables.length - IDEA_BASE_TABLES.length - LATER_TABLES.length,
    );

    apply(db, migration(), "migration.sql");
    const count = await db.query<{ n: string }>("SELECT count(*)::text AS n FROM idea_pages");
    expect(count[0]?.n).toBe("20");
  }, 180_000);

  it("migrate diff entre la base et schema.prisma est vide (code 0), l'agent (TK-90) appliqué", () => {
    // La base s'arrête à `*_idea` : le schéma courant porte aussi les tables de l'agent et des versions, des migrations suivantes (dont `project_creations`, TK-93, et `agent_proposals`, TK-99a).
    for (const suffix of [
      IDEA_AGENT_SUFFIX,
      IDEA_VERSIONS_SUFFIX,
      "_project_creations",
      "_agent_proposals",
      "_deliverable_overrides",
      "_spec_entities_review_versions",
    ]) {
      apply(db, dirs().find((dir) => dir.endsWith(suffix)) as string, "migration.sql");
    }
    const diff = ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath];
    const { status, output } = runPrisma([...diff, "--exit-code"], db.url);
    expect(status, output).toBe(0);
  }, 120_000);
});
