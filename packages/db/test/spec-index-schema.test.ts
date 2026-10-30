import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compositeKeyTables, runPrismaOrThrow, schemaPath } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { SPEC_MODELS, SPEC_TABLES, SPEC_TENANT_TABLES } from "./support/spec-fixtures.ts";

const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const FORBIDDEN_COLUMN = /token|secret|private_key|password|credential/i;

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
}, 180_000);

afterAll(async () => {
  await db?.dispose();
}, 60_000);

/** Champs liste SCALAIRES ou d'enum (les listes de relations inverses de Prisma sont légitimes). */
const scalarListFields = (source: string): string[] => {
  const enumNames = [...source.matchAll(/^enum (\w+) \{/gm)].map((m) => m[1]);
  const scalars = [
    "String",
    "Int",
    "BigInt",
    "Float",
    "Decimal",
    "Boolean",
    "DateTime",
    "Json",
    "Bytes",
    ...enumNames,
  ].join("|");
  return source.match(new RegExp(`^\\s+\\w+\\s+(?:${scalars})\\[\\]`, "gm")) ?? [];
};

const columns = (tables: readonly string[]) =>
  db.query<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>(
    `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY ($1)`,
    [[...tables]],
  );

describe("TK-41 C8 aucune colonne liste (incident 6)", () => {
  it("les 13 nouvelles tables existent (garde contre un test vacueux)", async () => {
    const rows = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    expect(rows.map((r) => r.table_name)).toEqual(expect.arrayContaining([...SPEC_TABLES]));
  });

  it("aucune colonne ARRAY dans le schéma public (information_schema et pg_type)", async () => {
    const viaInformationSchema = await db.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND data_type = 'ARRAY'`,
    );
    const viaCatalog = await db.query(
      `SELECT c.relname, a.attname FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_type t ON t.oid = a.atttypid
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
         AND t.typcategory = 'A'`,
    );
    expect(await columns(SPEC_TABLES)).not.toHaveLength(0);
    expect(viaInformationSchema).toEqual([]);
    expect(viaCatalog).toEqual([]);
  });

  it("schema.prisma déclare les 13 modèles et aucun champ liste", () => {
    const source = readFileSync(schemaPath, "utf8");
    for (const model of [...SPEC_MODELS, "WebhookDelivery"]) {
      expect(source, model).toMatch(new RegExp(`^model ${model} \\{`, "m"));
    }
    expect(scalarListFields(source)).toEqual([]);
  });

  it("contrôle négatif : un champ liste scalaire ou d'enum injecté dans une copie du schéma est détecté", () => {
    const source = readFileSync(schemaPath, "utf8");
    const enumName = [...source.matchAll(/^enum (\w+) \{/gm)][0]?.[1];
    expect(enumName).toBeDefined();

    const piegee = source.replace(
      /^model Ticket \{/m,
      `model Ticket {\n  scopes String[]\n  kinds ${enumName}[]`,
    );

    expect(scalarListFields(piegee)).toHaveLength(2);
    expect(scalarListFields(source)).toEqual([]);
  });

  it("chaque payload jsonb (webhooks, opérations) est borné à un objet par un CHECK", async () => {
    const checks = await db.query<{ relname: string; def: string }>(
      `SELECT cl.relname, pg_get_constraintdef(con.oid) AS def FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid
       WHERE con.contype = 'c' AND cl.relname IN ('webhook_deliveries', 'spec_write_operations')`,
    );
    for (const table of ["webhook_deliveries", "spec_write_operations"]) {
      expect(
        checks.some(
          (c) => c.relname === table && /jsonb_typeof\(payload\)\s*=\s*'object'/.test(c.def),
        ),
        `${table}: CHECK jsonb_typeof(payload) = 'object'`,
      ).toBe(true);
    }
  });
});

describe("TK-41 C4 aucun secret en base", () => {
  it("aucun nom de colonne ne contient token, secret, private_key, password ou credential", async () => {
    const rows = await columns(SPEC_TABLES);

    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows
        .filter((r) => FORBIDDEN_COLUMN.test(r.column_name))
        .map((r) => `${r.table_name}.${r.column_name}`),
    ).toEqual([]);
  });

  it("webhook_deliveries ne stocke ni signature ni en-têtes", async () => {
    const names = (await columns(["webhook_deliveries"])).map((r) => r.column_name);

    expect(names).toEqual(expect.arrayContaining(["provider", "delivery_id", "event", "payload"]));
    expect(names.filter((n) => /signature|header/i.test(n))).toEqual([]);
  });
});

describe("TK-41 C10 conventions §18.1", () => {
  it("tables et colonnes en snake_case, pas de deleted_at", async () => {
    const rows = await columns(SPEC_TABLES);

    for (const { table_name, column_name } of rows) {
      expect(table_name).toMatch(SNAKE_CASE);
      expect(column_name, `${table_name}.${column_name}`).toMatch(SNAKE_CASE);
      expect(column_name, `${table_name}.deleted_at`).not.toBe("deleted_at");
    }
  });

  it("PK uuid `id` partout, sauf les 3 liaisons et spec_heads à clé composite", async () => {
    const pks = await db.query<{ table_name: string; columns: string; types: string }>(
      `SELECT k.table_name, string_agg(k.column_name, ',' ORDER BY k.ordinal_position) AS columns,
              string_agg(c.data_type, ',' ORDER BY k.ordinal_position) AS types
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage k
         ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
       JOIN information_schema.columns c ON c.table_schema = k.table_schema
        AND c.table_name = k.table_name AND c.column_name = k.column_name
       WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
         AND k.table_name = ANY ($1) GROUP BY k.table_name`,
      [[...SPEC_TABLES]],
    );
    const byTable = new Map(pks.map((r) => [r.table_name, r]));

    const composite = SPEC_TABLES.filter((t) => compositeKeyTables.includes(t));
    expect([...composite].sort()).toEqual(
      ["spec_feature_endpoints", "spec_feature_tables", "spec_heads"].sort(),
    );
    for (const table of SPEC_TABLES.filter((t) => !composite.includes(t))) {
      expect(byTable.get(table)?.columns, `PK de ${table}`).toBe("id");
      expect(byTable.get(table)?.types, `type PK de ${table}`).toBe("uuid");
    }
    expect(byTable.get("spec_heads")?.columns).toBe("repo_id,branch");
    expect(byTable.get("spec_feature_tables")?.columns).toBe("feature_id,target_spec_id");
    expect(byTable.get("spec_feature_endpoints")?.columns).toBe("feature_id,target_spec_id");
  });
});

describe("TK-41 C10 conventions §18.1 : instants et enums", () => {
  it("created_at/updated_at NOT NULL partout (liaisons à clé composite exemptes), instants en timestamptz", async () => {
    const rows = await columns(SPEC_TABLES);
    const exempt = ["spec_feature_tables", "spec_feature_endpoints"];

    for (const table of SPEC_TABLES.filter((t) => !exempt.includes(t))) {
      for (const column of ["created_at", "updated_at"]) {
        const found = rows.find((r) => r.table_name === table && r.column_name === column);
        expect(found, `${table}.${column} existe`).toBeDefined();
        expect(found?.is_nullable, `${table}.${column} NOT NULL`).toBe("NO");
      }
    }
    const instants = rows.filter((r) => r.column_name.endsWith("_at"));
    expect(instants.length).toBeGreaterThan(10);
    for (const r of instants) {
      expect(r.data_type, `${r.table_name}.${r.column_name}`).toBe("timestamp with time zone");
    }
    for (const col of ["last_reconciled_at"]) {
      expect(rows.find((r) => r.column_name === col)?.is_nullable).toBe("YES");
    }
  });

  it("les enums natifs du contrat existent avec ces noms de type", async () => {
    const rows = await db.query<{ typname: string }>(
      `SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typtype = 'e'`,
    );
    expect(rows.map((r) => r.typname)).toEqual(
      expect.arrayContaining([
        "provider",
        "installation_status",
        "repo_role",
        "repo_mode",
        "owner_kind",
        "webhook_event",
        "webhook_delivery_status",
        "spec_index_status",
        "feature_status",
        "feature_priority",
        "endpoint_method",
        "write_batch_status",
      ]),
    );
  });
});

describe("TK-41 C9 colonnes multi-tenant et FK composites (H2)", () => {
  it("chaque table tenant a organization_id uuid NOT NULL et un index dessus", async () => {
    const cols = await columns(SPEC_TENANT_TABLES);
    const indexes = await db.query<{ tablename: string; indexdef: string }>(
      `SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY ($1)`,
      [[...SPEC_TENANT_TABLES]],
    );

    for (const table of SPEC_TENANT_TABLES) {
      const col = cols.find((c) => c.table_name === table && c.column_name === "organization_id");
      expect(col?.data_type, `${table}.organization_id`).toBe("uuid");
      expect(col?.is_nullable, `${table}.organization_id NOT NULL`).toBe("NO");
      expect(
        indexes.some((i) => i.tablename === table && /\(organization_id[,)]/.test(i.indexdef)),
        `${table} indexe organization_id`,
      ).toBe(true);
    }
  });

  it("webhook_deliveries n'a pas de colonne organization_id ni aucune FK (insérable avant toute installation)", async () => {
    const names = (await columns(["webhook_deliveries"])).map((r) => r.column_name);
    const fks = await db.query(
      `SELECT 1 FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid
       WHERE con.contype = 'f' AND cl.relname = 'webhook_deliveries'`,
    );

    expect(names).not.toContain("organization_id");
    expect(names).toContain("received_at");
    expect(fks).toEqual([]);
  });
});

describe("TK-41 C9 colonnes multi-tenant et FK composites (H2) : FK et unicité", () => {
  it("toutes les FK vers organizations sont en ON DELETE CASCADE", async () => {
    const rows = await db.query<{ relname: string; def: string }>(
      `SELECT cl.relname, pg_get_constraintdef(con.oid) AS def FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid
       WHERE con.contype = 'f' AND cl.relname = ANY ($1) AND con.confrelid = 'organizations'::regclass`,
      [[...SPEC_TENANT_TABLES]],
    );

    expect(rows.map((r) => r.relname).sort()).toEqual([...SPEC_TENANT_TABLES].sort());
    for (const r of rows) expect(r.def, r.relname).toMatch(/ON DELETE CASCADE/);
  });

  // H2 : si Prisma 7 ou l'extension tenant l'empêche, le développeur le consigne dans
  // .workflow/TK-41/04-green.md et ce test est remplacé par un test du repli documenté.
  it("UNIQUE(organization_id, id) existe sur projects et sur les tables parentes", async () => {
    const parents = [
      "projects",
      "provider_installations",
      "project_repos",
      "spec_snapshots",
      "spec_features",
      "spec_write_batches",
    ];
    const rows = await db.query<{ tablename: string; indexdef: string }>(
      `SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY ($1)`,
      [parents],
    );
    for (const table of parents) {
      expect(
        rows.some(
          (r) => r.tablename === table && /UNIQUE INDEX .*\(organization_id, id\)/.test(r.indexdef),
        ),
        `${table}: UNIQUE(organization_id, id)`,
      ).toBe(true);
    }
  });
});

describe("TK-41 C9 colonnes multi-tenant et FK composites (H2) : FK composites", () => {
  it("les FK enfant -> parent sont composites (organization_id, parent_id) ON DELETE CASCADE", async () => {
    const expected: [string, string, string][] = [
      ["project_repos", "project_id", "projects"],
      ["project_repos", "installation_id", "provider_installations"],
      ["spec_snapshots", "repo_id", "project_repos"],
      ["spec_heads", "repo_id", "project_repos"],
      ["spec_heads", "snapshot_id", "spec_snapshots"],
      ["spec_features", "snapshot_id", "spec_snapshots"],
      ["spec_criteria", "feature_id", "spec_features"],
      ["spec_tables", "snapshot_id", "spec_snapshots"],
      ["spec_endpoints", "snapshot_id", "spec_snapshots"],
      ["spec_feature_tables", "feature_id", "spec_features"],
      ["spec_feature_endpoints", "feature_id", "spec_features"],
      ["spec_write_batches", "project_id", "projects"],
      ["spec_write_batches", "repo_id", "project_repos"],
      ["spec_write_operations", "batch_id", "spec_write_batches"],
    ];
    const fks = await db.query<{ child: string; parent: string; def: string }>(
      `SELECT cl.relname AS child, pf.relname AS parent, pg_get_constraintdef(con.oid) AS def
       FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_class pf ON pf.oid = con.confrelid
       WHERE con.contype = 'f' AND cl.relname = ANY ($1)`,
      [[...SPEC_TENANT_TABLES]],
    );
    for (const [child, column, parent] of expected) {
      const found = fks.find(
        (f) =>
          f.child === child &&
          f.parent === parent &&
          f.def.startsWith(
            `FOREIGN KEY (organization_id, ${column}) REFERENCES ${parent}(organization_id, id)`,
          ),
      );
      expect(found, `${child}.${column} -> ${parent} composite`).toBeDefined();
      expect(found?.def, `${child}.${column} cascade`).toMatch(/ON DELETE CASCADE/);
    }
  });

  it("les liaisons n'ont aucune FK vers la table ou l'endpoint cible", async () => {
    const fks = await db.query<{ child: string; parent: string }>(
      `SELECT cl.relname AS child, pf.relname AS parent FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_class pf ON pf.oid = con.confrelid
       WHERE con.contype = 'f' AND cl.relname IN ('spec_feature_tables', 'spec_feature_endpoints')`,
    );
    const parents = new Set(fks.map((f) => f.parent));
    expect(parents.has("spec_tables")).toBe(false);
    expect(parents.has("spec_endpoints")).toBe(false);
    expect(fks.filter((f) => f.parent === "spec_features")).not.toHaveLength(0);
  });
});
